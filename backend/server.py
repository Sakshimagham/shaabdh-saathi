import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import io
import json
import logging
import os
from pathlib import Path
import random
import re
import tempfile
import time
from typing import Any, Dict, List, Optional
import uuid

import certifi
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, Form, Header, HTTPException, Query, UploadFile, Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ==========================================
# PDF AND DOCX SUPPORT IMPORTS
# ==========================================
try:
    import PyPDF2
    from io import BytesIO
    PDF_SUPPORT = True
    logger.info("✅ PyPDF2 loaded successfully")
except ImportError:
    PDF_SUPPORT = False
    logger.warning("⚠️ PyPDF2 not installed. PDF support disabled.")

try:
    import docx
    DOCX_SUPPORT = True
    logger.info("✅ python-docx loaded successfully")
except ImportError:
    DOCX_SUPPORT = False
    logger.warning("⚠️ python-docx not installed. DOCX support disabled.")

try:
    import fitz  # PyMuPDF
    PYMUPDF_SUPPORT = True
    logger.info("✅ PyMuPDF loaded successfully")
except ImportError:
    PYMUPDF_SUPPORT = False
    logger.warning("⚠️ PyMuPDF not installed. Using fallback PDF parser.")

# Safe Local faster-whisper SDK import
try:
    from faster_whisper import WhisperModel
    # Initialize local model once at server start (downloads 'base' model once)
    local_whisper = WhisperModel("base", device="cpu", compute_type="int8")
    FASTER_WHISPER_AVAILABLE = True
    logger.info("✅ local_whisper ('base' model on CPU) initialized successfully!")
except Exception as whisper_err:
    logger.warning(f"⚠️ Could not load faster-whisper model: {whisper_err}")
    local_whisper = None
    FASTER_WHISPER_AVAILABLE = False

# Safe Groq SDK import
try:
    from groq import AsyncGroq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False

# Safe OpenRouter SDK import
try:
    from openai import AsyncOpenAI
    OPENROUTER_AVAILABLE = True
except ImportError:
    OPENROUTER_AVAILABLE = False

# Safe Google Gemini SDK import
try:
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ.get("MONGO_URL")
if not mongo_url:
    logger.error("❌ MONGO_URL not found in environment variables!")

# Initialize MongoDB Client
client = AsyncIOMotorClient(
    mongo_url or "mongodb://localhost:27017", 
    tlsCAFile=certifi.where(), 
    serverSelectionTimeoutMS=10000
)
db = client[os.environ.get("DB_NAME", "shaabdh_saathi")]

# --- Initialize Multi-Provider Clients ---
groq_api_key = os.environ.get("GROQ_API_KEY")
groq_client = (
    AsyncGroq(api_key=groq_api_key) if (GROQ_AVAILABLE and groq_api_key) else None
)

openrouter_api_key = os.environ.get("OPENROUTER_API_KEY")
openrouter_client = (
    AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=openrouter_api_key,
    ) if (OPENROUTER_AVAILABLE and openrouter_api_key) else None
)

gemini_api_key = os.environ.get("GEMINI_API_KEY")
gemini_client = (
    genai.Client(api_key=gemini_api_key) if (GEMINI_AVAILABLE and gemini_api_key) else None
)


# ==========================================
# GEMINI MODEL AVAILABILITY CACHE
# ==========================================
gemini_available_models_cache = None
gemini_cache_timestamp = None

async def get_available_gemini_models():
    """Get available Gemini models and cache them for 1 hour."""
    global gemini_available_models_cache, gemini_cache_timestamp
    
    # Check if cache is valid (1 hour)
    if gemini_available_models_cache and gemini_cache_timestamp:
        if time.time() - gemini_cache_timestamp < 3600:
            return gemini_available_models_cache
    
    if not gemini_client:
        return []
    
    try:
        models = gemini_client.models.list()
        available = []
        for model in models:
            if "gemini" in model.name.lower():
                # Filter out models that don't work or give partial responses
                skip_patterns = ["embedding", "tts", "audio", "computer-use", "live-preview", "streaming", "translate", "image", "preview-tts"]
                if any(x in model.name.lower() for x in skip_patterns):
                    continue
                available.append(model.name)
        
        gemini_available_models_cache = available
        gemini_cache_timestamp = time.time()
        logger.info(f"✅ Cached {len(available)} Gemini models")
        return available
    except Exception as e:
        logger.warning(f"⚠️ Could not fetch Gemini models: {e}")
        # Return ONLY the 8 models that gave FULL responses from testing
        return [
            "gemini-flash-lite-latest",
            "gemini-flash-latest",
            "gemini-3-flash-preview",
            "gemini-robotics-er-2-preview",
            "gemini-3.7-flash-video-understanding-eap",
            "gemini-3.1-flash-lite",
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite-preview",
        ]


# ==========================================
# LOCAL WHISPER TRANSCRIPTION HELPER
# ==========================================
async def transcribe_locally(audio_bytes: bytes) -> str:
    """
    Transcribes audio locally on CPU using faster-whisper.
    Consumes 0 API tokens and has no cloud timeouts.
    Uses asyncio.to_thread to run non-blockingly.
    """
    if not local_whisper:
        raise Exception("faster-whisper model is not initialized on this server.")

    def _sync_transcribe():
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=True) as temp_audio:
            temp_audio.write(audio_bytes)
            temp_audio.flush()
            
            segments, info = local_whisper.transcribe(temp_audio.name, beam_size=5)
            return " ".join([segment.text for segment in segments]).strip()

    # Offload CPU-bound inference to worker thread pool
    return await asyncio.to_thread(_sync_transcribe)


# ==========================================
# PER-MESSAGE METRICS ANALYZER
# ==========================================
def analyze_message_metrics(text: str) -> dict:
    """
    Analyze a single user message and return detailed metrics.
    This runs locally without LLM calls for speed.
    """
    import re
    from collections import Counter
    
    # Split words
    words = text.split()
    total_words = len(words)
    
    if total_words == 0:
        return {
            "fluency": 0,
            "grammar": 0,
            "vocabulary": 0,
            "pronunciation": 0,
            "confidence": 0,
            "word_count": 0,
            "english_words": 0,
            "marathi_words": 0,
            "english_percentage": 0,
            "grammar_errors": 0,
            "vocabulary_suggestions": [],
            "pronunciation_hints": [],
            "feedback_short": "Please say something!"
        }
    
    # Detect English vs Marathi
    devanagari_pattern = re.compile(r'[\u0900-\u097F]')
    english_pattern = re.compile(r'[a-zA-Z]')
    
    english_words = 0
    marathi_words = 0
    mixed_words = 0
    
    for word in words:
        if devanagari_pattern.search(word):
            marathi_words += 1
        elif english_pattern.search(word):
            english_words += 1
        else:
            mixed_words += 1
    
    english_percentage = int((english_words / total_words) * 100) if total_words > 0 else 0
    
    # Grammar error detection (simplified)
    grammar_errors = 0
    text_lower = text.lower()
    
    # Common grammar issues
    if ' i ' in text_lower or text_lower.startswith('i ') or text_lower.endswith(' i'):
        grammar_errors += 1
    if ' dont ' in text_lower or " don't " in text_lower:
        grammar_errors += 1
    if ' doesnt ' in text_lower or " doesn't " in text_lower:
        grammar_errors += 1
    if ' didnt ' in text_lower or " didn't " in text_lower:
        grammar_errors += 1
    
    # Check for sentence structure issues (no verb detected)
    has_verb = any(word in text_lower.split() for word in ['is', 'am', 'are', 'was', 'were', 'have', 'has', 'had', 'do', 'does', 'did', 'go', 'went', 'come', 'came', 'see', 'saw', 'get', 'got', 'make', 'made'])
    if not has_verb and total_words > 2:
        grammar_errors += 1
    
    # Vocabulary variety
    unique_words = len(set(w.lower() for w in words if w.isalpha()))
    vocab_ratio = unique_words / total_words if total_words > 0 else 0
    
    # Common word suggestions
    vocabulary_suggestions = []
    common_words_map = {
        'good': 'excellent, wonderful, fantastic',
        'nice': 'pleasant, delightful, charming',
        'great': 'amazing, incredible, outstanding',
        'bad': 'terrible, awful, poor',
        'small': 'tiny, mini, compact',
        'big': 'large, huge, enormous',
        'like': 'enjoy, appreciate, adore',
        'love': 'admire, cherish, treasure',
        'go': 'proceed, travel, venture',
        'come': 'arrive, approach, appear',
        'see': 'observe, notice, view',
        'get': 'obtain, acquire, receive',
        'take': 'grab, select, choose',
        'make': 'create, produce, form',
        'happy': 'joyful, delighted, cheerful',
        'sad': 'melancholy, sorrowful, upset',
        'very': 'extremely, highly, immensely',
        'really': 'truly, genuinely, absolutely',
        'think': 'believe, consider, reflect',
        'know': 'understand, comprehend, realize'
    }
    
    for word in words:
        word_lower = word.lower()
        if word_lower in common_words_map and len(vocabulary_suggestions) < 3:
            suggestions = common_words_map[word_lower].split(', ')
            for s in suggestions:
                if s not in vocabulary_suggestions:
                    vocabulary_suggestions.append(s)
                    if len(vocabulary_suggestions) >= 3:
                        break
    
    # Pronunciation hints
    pronunciation_hints = []
    
    # Common pronunciation issues for Marathi speakers
    common_pronunciation_issues = {
        'where': "Say 'wer' (rhymes with 'hair') - don't say 'hwair'",
        'what': "Say 'wot' - don't say 'hwat'",
        'when': "Say 'wen' - don't say 'hwen'",
        'why': "Say 'wai' - don't say 'hwai'",
        'which': "Say 'wich' - don't say 'hwich'",
        'these': "Say 'theez' - long 'ee' sound",
        'those': "Say 'thohz' - long 'oh' sound",
        'there': "Say 'thair' - not 'dayr'",
        'their': "Say 'thair' - rhymes with 'hair'",
        'they': "Say 'thay' - not 'day'",
        'think': "Say 'think' - not 'sink'",
        'thank': "Say 'thank' - not 'sank'",
        'three': "Say 'three' - not 'tree'",
        'through': "Say 'threw' - not 'trew'",
        'though': "Say 'tho' - silent 'gh'",
        'thought': "Say 'thot' - not 'tot'",
        'beautiful': "Say 'byoo-ti-ful' - 3 syllables",
        'comfortable': "Say 'kumf-tuh-bul' - 3 syllables",
        'vegetable': "Say 'vej-tuh-bul' - 3 syllables",
        'interested': "Say 'in-tres-tid' - not 'in-ter-es-ted'",
        'interesting': "Say 'in-tres-ting' - not 'in-ter-es-ting'",
        'library': "Say 'lie-brer-ee' - not 'lie-berry'",
        'February': "Say 'feb-roo-air-ee' - not 'feb-yoo-air-ee'",
    }
    
    for word in words:
        word_lower = word.lower()
        if word_lower in common_pronunciation_issues and len(pronunciation_hints) < 2:
            pronunciation_hints.append(f"'{word}': {common_pronunciation_issues[word_lower]}")
    
    # Calculate scores
    fluency = min(95, max(30, 60 + (min(total_words, 20) * 1.5) - (grammar_errors * 3)))
    confidence = min(95, max(25, 50 + (min(total_words, 15) * 2) + (vocab_ratio * 30) - (marathi_words * 1.5)))
    vocabulary = min(95, max(20, 45 + (vocab_ratio * 50) + (len(set(w.lower() for w in words if w.isalpha())) * 2)))
    grammar = min(95, max(20, 80 - (grammar_errors * 10)))
    pronunciation = min(95, max(30, 75 - (len([w for w in words if w.lower() in common_pronunciation_issues]) * 3)))
    
    # Short feedback
    feedback_short = ""
    if grammar_errors > 2:
        feedback_short += "Watch your grammar. "
    elif grammar_errors > 0:
        feedback_short += "Minor grammar issues. "
    else:
        feedback_short += "Great grammar! "
    
    if marathi_words > english_words and english_words > 0:
        feedback_short += "Try using more English words."
    elif english_words > 0 and english_words > marathi_words:
        feedback_short += "Good use of English vocabulary!"
    elif english_words == 0:
        feedback_short += "Try to use some English words."
    else:
        feedback_short += "Nice balance of languages!"
    
    return {
        "fluency": int(fluency),
        "grammar": int(grammar),
        "vocabulary": int(vocabulary),
        "pronunciation": int(pronunciation),
        "confidence": int(confidence),
        "word_count": total_words,
        "english_words": english_words,
        "marathi_words": marathi_words,
        "english_percentage": english_percentage,
        "grammar_errors": grammar_errors,
        "vocabulary_suggestions": vocabulary_suggestions[:3],
        "pronunciation_hints": pronunciation_hints[:2],
        "feedback_short": feedback_short
    }


# ==========================================
# PDF EXTRACTION FUNCTIONS
# ==========================================
async def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF using available libraries."""
    extracted_text = ""
    
    # Try PyMuPDF first (best for complex PDFs)
    if PYMUPDF_SUPPORT:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            for page in doc:
                page_text = page.get_text()
                if page_text:
                    extracted_text += page_text + "\n"
            doc.close()
            if extracted_text.strip():
                logger.info("✅ Extracted PDF text using PyMuPDF")
                return extracted_text
        except Exception as e:
            logger.warning(f"PyMuPDF extraction failed: {e}")
    
    # Try PyPDF2 as fallback
    if PDF_SUPPORT:
        try:
            pdf_reader = PyPDF2.PdfReader(BytesIO(file_bytes))
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    extracted_text += page_text + "\n"
            if extracted_text.strip():
                logger.info("✅ Extracted PDF text using PyPDF2")
                return extracted_text
        except Exception as e:
            logger.warning(f"PyPDF2 extraction failed: {e}")
    
    # Try a simpler approach - direct text extraction
    try:
        import re
        text = file_bytes.decode('utf-8', errors='ignore')
        text = re.sub(r'[^\w\s.,!?;:\-()\[\]{}%$@#&]', ' ', text)
        text = ' '.join(text.split())
        if len(text) > 100:
            logger.info("✅ Extracted PDF text using raw decode")
            return text
    except Exception as e:
        logger.warning(f"Raw decode failed: {e}")
    
    if not extracted_text.strip():
        raise Exception("No text could be extracted from PDF")
    
    return extracted_text


async def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX file."""
    if not DOCX_SUPPORT:
        raise Exception("python-docx not installed for DOCX support")
    
    try:
        doc = docx.Document(BytesIO(file_bytes))
        extracted_text = "\n".join([para.text for para in doc.paragraphs if para.text.strip()])
        if extracted_text.strip():
            return extracted_text
    except Exception as e:
        logger.warning(f"DOCX extraction failed: {e}")
    
    # Try fallback: treat as zip and extract
    try:
        import zipfile
        import xml.etree.ElementTree as ET
        
        with zipfile.ZipFile(BytesIO(file_bytes)) as zip_ref:
            if 'word/document.xml' in zip_ref.namelist():
                xml_content = zip_ref.read('word/document.xml')
                root = ET.fromstring(xml_content)
                namespace = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                texts = []
                for elem in root.findall('.//w:t', namespace):
                    if elem.text:
                        texts.append(elem.text)
                extracted_text = ' '.join(texts)
                if extracted_text.strip():
                    logger.info("✅ Extracted DOCX text using zip fallback")
                    return extracted_text
    except Exception as e:
        logger.warning(f"DOCX zip fallback failed: {e}")
    
    raise Exception("No text could be extracted from DOCX")


def generate_fallback_analysis(text: str) -> dict:
    """Generate fallback analysis when LLM fails."""
    keywords = ["communication", "team", "leadership", "project", "management", 
                "data", "analysis", "development", "design", "problem", "solving"]
    
    found_keywords = []
    for kw in keywords:
        if kw.lower() in text.lower():
            found_keywords.append(kw.title())
    
    if not found_keywords:
        found_keywords = ["Communication", "Problem Solving", "Teamwork"]
    
    return {
        "extracted_skills": found_keywords[:5],
        "strengths": ["Clear communication", "Good technical foundation", "Team player", "Problem solver"],
        "weaknesses": ["Could provide more specific examples", "Missing quantifiable achievements", "Needs stronger summary"],
        "ats_score": 65,
        "missing_keywords": ["data analysis", "forecasting", "data visualization", "project management"],
        "improvement_suggestions": [
            {"section": "Experience", "suggestion": "Add specific metrics and achievements (e.g., 'Increased sales by 20%')"},
            {"section": "Skills", "suggestion": "Include more relevant technical skills"},
            {"section": "Summary", "suggestion": "Write a stronger professional summary"}
        ],
        "formatting_tips": ["Use bullet points for readability", "Keep consistent formatting", "Use action verbs"],
        "overall_rating": "Average",
        "summary_feedback": "The resume has good potential but needs more specific achievements and better keyword optimization."
    }


def generate_fallback_questions(role: str, count: int) -> List[Dict]:
    """Generate fallback interview questions if LLM fails."""
    import random
    
    behavioral_qs = [
        "Tell me about a time you faced a challenge at work and how you overcame it.",
        "Describe a situation where you had to work with a difficult team member.",
        "Give me an example of a goal you set and how you achieved it.",
        "Tell me about a time you made a mistake and what you learned from it.",
        "Describe a situation where you showed leadership skills.",
        "Tell me about a time you had to adapt to a major change at work.",
        "Describe a project you're most proud of and why.",
        "How do you handle stress and pressure in the workplace?",
    ]
    
    technical_qs = [
        "What's your approach to solving complex problems?",
        "How do you stay updated with the latest technologies?",
        "Describe your experience with project management.",
        "How do you prioritize tasks when working on multiple projects?",
        "What tools and technologies are you most comfortable with?",
        "Describe your experience with agile methodologies.",
        "How do you ensure quality in your work?",
        "What's your approach to debugging and troubleshooting?",
    ]
    
    situational_qs = [
        "How would you handle a tight deadline with limited resources?",
        "What would you do if you disagreed with your manager's decision?",
        "How would you handle a difficult client or stakeholder?",
        "Describe how you would approach a project you've never done before.",
        "How would you handle a team member who isn't performing?",
        "What would you do if you were given conflicting priorities?",
    ]
    
    culture_qs = [
        "What type of work environment helps you perform best?",
        "How do you handle feedback and criticism?",
        "What's your ideal team dynamic?",
        "How do you contribute to a positive team culture?",
        "What values are most important to you in a workplace?",
        "Describe your preferred management style.",
    ]
    
    problem_solving_qs = [
        "How do you approach problems you've never encountered before?",
        "Describe a time you had to think outside the box to solve a problem.",
        "How do you handle uncertainty in your work?",
        "What's your process for making important decisions?",
        "Describe a complex problem you solved and your approach.",
    ]
    
    all_qs = behavioral_qs + technical_qs + situational_qs + culture_qs + problem_solving_qs
    q_types = ["behavioral"] * len(behavioral_qs) + ["technical"] * len(technical_qs) + \
              ["situational"] * len(situational_qs) + ["culture"] * len(culture_qs) + \
              ["problem_solving"] * len(problem_solving_qs)
    
    combined = list(zip(all_qs, q_types))
    random.shuffle(combined)
    
    selected = combined[:count]
    difficulty_levels = ["Beginner", "Intermediate", "Advanced"]
    
    questions = []
    for i, (q, q_type) in enumerate(selected):
        diff = difficulty_levels[i % len(difficulty_levels)]
        questions.append({
            "id": f"q{i+1}",
            "type": q_type,
            "question": q,
            "category": role if role != "General" else "General",
            "difficulty": diff,
            "sample_answer": "A good answer should be specific, structured, and demonstrate relevant skills and experience.",
            "key_points": ["Clear communication", "Specific example", "Relevant outcome"],
            "common_mistakes": ["Being too vague", "Not providing specific examples", "Going off-topic"],
            "follow_up_hint": "Could you elaborate on that with a specific example?"
        })
    
    return questions


# ==========================================
# MULTI-PROVIDER LLM FALLBACK EXECUTER
# ==========================================
async def call_llm_with_fallback(
    system_prompt: str, 
    user_prompt: str, 
    temperature: float = 0.7
) -> dict:
    """
    Cascades requests seamlessly across providers:
    1. Groq (llama-3.3-70b-versatile) - Fastest, most capable
    2. Groq (llama-3.1-8b-instant) - Fast fallback
    3. OpenRouter (deepseek/deepseek-chat) - Good quality
    4. OpenRouter (meta-llama/llama-3.3-70b-instruct) - Quality fallback
    5. Google Gemini models - Efficient fallback
    """
    
    errors = []

    # 1. Try Groq Models
    if groq_client:
        groq_models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
        for model in groq_models:
            try:
                logger.info(f"⚡ Trying Groq model: {model}")
                
                truncated_system = system_prompt[:3000] if len(system_prompt) > 3000 else system_prompt
                truncated_user = user_prompt[:3000] if len(user_prompt) > 3000 else user_prompt
                
                response = await groq_client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": truncated_system},
                        {"role": "user", "content": truncated_user},
                    ],
                    temperature=temperature,
                    max_tokens=1500,
                    response_format={"type": "json_object"},
                )
                result = json.loads(response.choices[0].message.content)
                logger.info(f"✅ Groq {model} succeeded!")
                return result
            except Exception as e:
                error_msg = str(e)
                if "429" in error_msg or "rate_limit" in error_msg.lower():
                    logger.warning(f"⚠️ Groq rate limit hit on {model}, moving to next...")
                else:
                    logger.warning(f"⚠️ Groq failed on {model}: {e}")
                errors.append(f"Groq {model}: {e}")
                await asyncio.sleep(0.1)
                continue

    # 2. Try OpenRouter Fallback
    if openrouter_client:
        openrouter_models = [
            "deepseek/deepseek-chat",
            "meta-llama/llama-3.3-70b-instruct",
            "mistralai/mistral-7b-instruct",
            "anthropic/claude-3.5-sonnet",
        ]
        for model in openrouter_models:
            try:
                logger.info(f"⚡ Fallback: Trying OpenRouter model: {model}")
                response = await openrouter_client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt[:3000]},
                        {"role": "user", "content": user_prompt[:3000]},
                    ],
                    temperature=temperature,
                    max_tokens=1500,
                    response_format={"type": "json_object"},
                    extra_headers={
                        "HTTP-Referer": "http://localhost:3000",
                        "X-Title": "Shaabdh Saathi",
                    },
                )
                result = json.loads(response.choices[0].message.content)
                logger.info(f"✅ OpenRouter {model} succeeded!")
                return result
            except Exception as e:
                logger.warning(f"⚠️ OpenRouter error on {model}: {e}")
                errors.append(f"OpenRouter {model}: {e}")
                await asyncio.sleep(0.1)
                continue

    # 3. Try Google Gemini Models
    if gemini_client:
        available_gemini_models = await get_available_gemini_models()
        gemini_model_priority = [
            "gemini-flash-lite-latest",
            "gemini-flash-latest",
            "gemini-3-flash-preview",
            "gemini-robotics-er-2-preview",
            "gemini-3.7-flash-video-understanding-eap",
            "gemini-3.1-flash-lite",
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite-preview",
        ]
        
        models_to_try = [m for m in gemini_model_priority if m in available_gemini_models]
        
        if not models_to_try:
            models_to_try = [
                "gemini-flash-lite-latest",
                "gemini-flash-latest",
                "gemini-3-flash-preview",
            ]
        
        for model_name in models_to_try:
            try:
                logger.info(f"⚡ Fallback: Trying Google Gemini ({model_name})...")
                prompt_combined = f"{system_prompt[:3000]}\n\nUser Input:\n{user_prompt[:3000]}"
                
                response = gemini_client.models.generate_content(
                    model=model_name,
                    contents=prompt_combined,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=temperature,
                        max_output_tokens=1500,
                    )
                )
                result = json.loads(response.text)
                logger.info(f"✅ Gemini {model_name} succeeded! ({len(result)} keys)")
                return result
            except Exception as e:
                error_msg = str(e)
                if "429" in error_msg or "quota" in error_msg.lower():
                    logger.warning(f"⚠️ Gemini {model_name} quota exceeded, trying next...")
                elif "404" in error_msg or "not found" in error_msg.lower():
                    logger.warning(f"⚠️ Gemini {model_name} not found, trying next...")
                else:
                    logger.warning(f"⚠️ Gemini {model_name} failed: {e}")
                errors.append(f"Gemini {model_name}: {e}")
                await asyncio.sleep(0.1)
                continue

    error_summary = "; ".join(errors)
    raise Exception(f"All LLM providers failed. Errors: {error_summary}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager replacing deprecated on_event handlers."""
    yield
    client.close()


app = FastAPI(
    title="Shaabdh Saathi Progressive Learning API",
    lifespan=lifespan
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://shaabdh-saathi.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")


# ==========================================
# PYDANTIC MODELS
# ==========================================
class UserLogin(BaseModel):
    name: str
    contact: str


class ProgressUpdateRequest(BaseModel):
    skill: str
    xp: int
    words: Optional[int] = 0
    user_id: Optional[str] = None


class ChapterGenerationRequest(BaseModel):
    user_id: Optional[str] = "default_user"
    domain: Optional[str] = "Finance & Wealth"
    chapter_number: Optional[int] = 1


class DialoguesRequest(BaseModel):
    page: Optional[int] = 1


class WordTranslationRequest(BaseModel):
    word: str


class PronunciationBotRequest(BaseModel):
    sentence: str


class TTSMarksRequest(BaseModel):
    page_text: str


class WritingPromptRequest(BaseModel):
    level: int = 1
    category: Optional[str] = None
    user_id: Optional[str] = None


class WritingEvalRequest(BaseModel):
    prompt: Optional[str] = ""
    prompt_mr: Optional[str] = ""
    hints: Optional[List[str]] = []
    text: str
    level: int = 1
    language: Optional[str] = "marathi"


class MessageModel(BaseModel):
    sender: str
    text: str
    isVoice: Optional[bool] = None
    audioDuration: Optional[str] = None
    audioUrl: Optional[str] = None


class TalkBotRequest(BaseModel):
    conversation: List[MessageModel]
    level: Optional[int] = 1
    persona: Optional[str] = "marathi_medium_supportive_teacher"
    english_percent: Optional[int] = 50
    is_initial_greeting: Optional[bool] = False
    day: Optional[int] = 1


class MetricsRequest(BaseModel):
    conversation: List[MessageModel]
    day: int
    level: Optional[int] = 1


# ==========================================
# INTERVIEW PREPARATION MODELS
# ==========================================
class InterviewPracticeRequest(BaseModel):
    question: str
    user_answer: str
    question_id: Optional[str] = None
    context: Optional[Dict] = None


class InterviewFeedbackRequest(BaseModel):
    conversation: List[Dict]
    job_role: Optional[str] = None
    level: Optional[int] = 1


# ==========================================
# GROQ VOICE TALK BOT ENDPOINT
# ==========================================
@api_router.post("/groq-voice-talk-bot")
async def groq_voice_talk_bot(
    audio: UploadFile = File(...),
    history: str = Form(default="[]")
):
    """
    Directly listens to the user's voice recording, transcribes it 
    using multiple methods (faster-whisper, Google Speech, Vosk).
    """
    try:
        audio_bytes = await audio.read()
        filename = audio.filename or "voice_note.webm"
        logger.info(f"🎙️ Received audio file: {filename}, Size: {len(audio_bytes)} bytes")

        user_spoken_text = None
        transcription_method = None

        # METHOD 1: Try faster-whisper
        if FASTER_WHISPER_AVAILABLE and local_whisper:
            try:
                user_spoken_text = await transcribe_locally(audio_bytes)
                if user_spoken_text and len(user_spoken_text.strip()) > 0:
                    transcription_method = "faster-whisper"
                    logger.info(f"✅ faster-whisper: '{user_spoken_text}'")
            except Exception as e:
                logger.warning(f"⚠️ faster-whisper failed: {e}")
                user_spoken_text = None

        # METHOD 2: Try Google Speech Recognition
        if not user_spoken_text or len(user_spoken_text.strip()) == 0:
            try:
                import speech_recognition as sr
                import tempfile
                import os
                import subprocess
                
                with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp_webm:
                    temp_webm.write(audio_bytes)
                    webm_path = temp_webm.name
                
                wav_path = webm_path.replace('.webm', '.wav')
                
                try:
                    from pydub import AudioSegment
                    audio_segment = AudioSegment.from_file(webm_path, format="webm")
                    audio_segment.export(wav_path, format="wav")
                except:
                    try:
                        subprocess.run(['ffmpeg', '-i', webm_path, wav_path], 
                                     capture_output=True, check=True)
                    except:
                        wav_path = webm_path
                
                recognizer = sr.Recognizer()
                with sr.AudioFile(wav_path) as source:
                    recognizer.adjust_for_ambient_noise(source, duration=0.5)
                    audio_data = recognizer.record(source)
                    
                    languages = ["en-US", "mr-IN", "hi-IN", "en-IN"]
                    for lang in languages:
                        try:
                            user_spoken_text = recognizer.recognize_google(audio_data, language=lang)
                            if user_spoken_text and len(user_spoken_text.strip()) > 0:
                                transcription_method = f"google-speech-{lang}"
                                logger.info(f"✅ Google Speech ({lang}): '{user_spoken_text}'")
                                break
                        except:
                            continue
                
                try:
                    os.unlink(webm_path)
                    if os.path.exists(wav_path) and wav_path != webm_path:
                        os.unlink(wav_path)
                except:
                    pass
                    
            except Exception as e:
                logger.warning(f"⚠️ Google Speech failed: {e}")
                user_spoken_text = None

        # METHOD 3: Try Vosk
        if not user_spoken_text or len(user_spoken_text.strip()) == 0:
            try:
                import vosk
                import wave
                import json
                import tempfile
                import os
                import urllib.request
                import zipfile
                
                model_path = "models/vosk-model-small-en-us-0.15"
                if not os.path.exists(model_path):
                    logger.info("📥 Downloading Vosk model...")
                    os.makedirs("models", exist_ok=True)
                    url = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
                    zip_path = "models/vosk-model.zip"
                    urllib.request.urlretrieve(url, zip_path)
                    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                        zip_ref.extractall("models")
                    os.remove(zip_path)
                    logger.info("✅ Vosk model downloaded!")
                
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_audio:
                    temp_audio.write(audio_bytes)
                    temp_path = temp_audio.name
                
                model = vosk.Model(model_path)
                rec = vosk.KaldiRecognizer(model, 16000)
                
                wf = wave.open(temp_path, "rb")
                full_text = []
                while True:
                    data = wf.readframes(4000)
                    if len(data) == 0:
                        break
                    if rec.AcceptWaveform(data):
                        result = json.loads(rec.Result())
                        text = result.get("text", "")
                        if text:
                            full_text.append(text)
                
                user_spoken_text = " ".join(full_text)
                
                try:
                    os.unlink(temp_path)
                except:
                    pass
                
                if user_spoken_text and len(user_spoken_text.strip()) > 0:
                    transcription_method = "vosk"
                    logger.info(f"✅ Vosk: '{user_spoken_text}'")
                    
            except Exception as e:
                logger.warning(f"⚠️ Vosk failed: {e}")
                user_spoken_text = None

        if not user_spoken_text or len(user_spoken_text.strip()) == 0:
            logger.error("❌ All transcription methods failed")
            return {
                "reply": "I couldn't hear you clearly. Please type your message.",
                "feedback_mr": "कृपया तुमचा संदेश टाइप करा.",
                "soft_skill_tip": "Type your message clearly.",
                "transcribed_text": "",
                "method": "none"
            }

        conversation_history = []
        try:
            if history and history != "[]":
                conversation_history = json.loads(history)
        except Exception:
            conversation_history = []

        history_formatted = "\n".join([
            f"{msg.get('sender', 'user').upper()}: {msg.get('text', '')}" 
            for msg in conversation_history[-10:]
        ])

        system_prompt = (
            "You are a warm, patient English conversation partner. "
            "Reply with simple English and ask one follow-up question. "
            "Provide encouragement in Marathi. "
            "Return JSON: {\"reply\": \"Simple response with follow-up\", "
            "\"feedback_mr\": \"Encouragement in Marathi\", "
            "\"soft_skill_tip\": \"Brief tip\"}"
        )
        
        user_prompt = f"History:\n{history_formatted}\n\nUser said: '{user_spoken_text}'"

        result = await call_llm_with_fallback(system_prompt, user_prompt, temperature=0.7)
        
        result.setdefault("feedback_mr", "तुमचा प्रयत्न खूप छान आहे! असेच बोलत राहा.")
        result.setdefault("soft_skill_tip", "Practice speaking slowly and clearly.")
        result["transcribed_text"] = user_spoken_text
        result["method"] = transcription_method or "unknown"
        
        return result

    except Exception as e:
        logger.error(f"❌ Error in groq-voice-talk-bot: {e}")
        return {
            "reply": "Voice processing error. Please type your message.",
            "feedback_mr": "कृपया तुमचा संदेश टाइप करा.",
            "soft_skill_tip": "Type your message clearly.",
            "transcribed_text": "",
            "method": "error"
        }


# ==========================================
# INTERVIEW PREPARATION ENDPOINTS - FIXED
# ==========================================

@api_router.post("/interview/analyze-resume")
async def analyze_resume(
    file: UploadFile = File(None),
    resume_text: str = Form(None),
    job_description: str = Form(""),
    user_id: str = Form(None)
):
    """
    Analyzes resume content and provides structured feedback.
    Supports both file upload (PDF, DOCX, TXT) and direct text input.
    """
    try:
        extracted_text = ""
        file_name = file.filename if file else None
        
        # Case 1: File uploaded
        if file:
            logger.info(f"📄 Processing resume file: {file_name}")
            
            # Read file content
            file_bytes = await file.read()
            
            # Extract text based on file type
            if file_name and file_name.lower().endswith('.txt'):
                try:
                    extracted_text = file_bytes.decode('utf-8', errors='ignore')
                    logger.info(f"✅ Extracted {len(extracted_text)} chars from TXT")
                except Exception as e:
                    logger.error(f"TXT decode error: {e}")
                    raise HTTPException(status_code=400, detail="Could not read text file")
                
            elif file_name and file_name.lower().endswith('.pdf'):
                extracted_text = await extract_text_from_pdf(file_bytes)
                if not extracted_text or not extracted_text.strip():
                    raise HTTPException(
                        status_code=400,
                        detail="No text could be extracted from the PDF. Please ensure it's a text-based PDF (not scanned)."
                    )
                logger.info(f"✅ Extracted {len(extracted_text)} chars from PDF")
                
            elif file_name and file_name.lower().endswith(('.doc', '.docx')):
                extracted_text = await extract_text_from_docx(file_bytes)
                if not extracted_text or not extracted_text.strip():
                    raise HTTPException(
                        status_code=400,
                        detail="No text could be extracted from the DOCX file."
                    )
                logger.info(f"✅ Extracted {len(extracted_text)} chars from DOCX")
                
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file type: {file_name}. Please upload PDF, DOCX, or TXT."
                )
            
            if not extracted_text or not extracted_text.strip():
                raise HTTPException(
                    status_code=400,
                    detail="No text could be extracted from the file. Please ensure it's a valid document."
                )
            
        # Case 2: Direct text input
        elif resume_text:
            extracted_text = resume_text
            logger.info(f"📝 Received text input: {len(extracted_text)} chars")
            
        else:
            raise HTTPException(
                status_code=400,
                detail="Please provide either a file upload or resume_text"
            )
        
        # Truncate for analysis
        resume_analysis_text = extracted_text[:3000]
        jd_text = job_description or ""
        if len(jd_text) > 1500:
            jd_text = jd_text[:1500] + "..."
        
        # Build system prompt for resume analysis
        system_prompt = """You are an expert ATS (Applicant Tracking System) resume reviewer and career coach. 
        Analyze the resume and provide structured, actionable feedback.
        
        IMPORTANT: Return ONLY valid JSON with these exact keys:
        - extracted_skills: array of top skills found
        - strengths: array of 3-4 key strengths
        - weaknesses: array of 3-4 areas for improvement
        - ats_score: number between 0-100
        - missing_keywords: array of important keywords missing
        - improvement_suggestions: array of objects with "section" and "suggestion"
        - formatting_tips: array of formatting suggestions
        - overall_rating: string ("Excellent", "Good", "Average", "Poor")
        - summary_feedback: string with overall feedback
        
        Keep each item short and actionable. Maximum 4 items per array.
        """
        
        user_prompt = f"""
        Resume Content:
        {resume_analysis_text}
        
        {f"Job Description (for context): {jd_text}" if jd_text else ""}
        
        Provide structured feedback in valid JSON format.
        """
        
        # Try to get analysis from LLM
        try:
            result = await call_llm_with_fallback(system_prompt, user_prompt, temperature=0.3)
        except Exception as llm_err:
            logger.error(f"LLM analysis failed: {llm_err}")
            result = generate_fallback_analysis(extracted_text)
        
        # Ensure all fields exist
        result.setdefault("extracted_skills", ["Communication", "Problem Solving", "Teamwork"])
        result.setdefault("strengths", ["Clear communication", "Good technical foundation", "Team player"])
        result.setdefault("weaknesses", ["Could provide more specific examples", "Missing quantifiable achievements"])
        result.setdefault("ats_score", 75)
        result.setdefault("missing_keywords", ["data analysis", "project management", "leadership"])
        result.setdefault("improvement_suggestions", [
            {"section": "Experience", "suggestion": "Add specific metrics and achievements"},
            {"section": "Skills", "suggestion": "Include more relevant technical skills"}
        ])
        result.setdefault("formatting_tips", ["Use bullet points for readability", "Keep consistent formatting"])
        result.setdefault("overall_rating", "Good")
        result.setdefault("summary_feedback", "Resume shows good potential. Consider adding more specific metrics and tailoring to the job description.")
        
        # Save to database
        if user_id:
            try:
                await db.interview_data.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "resume_analysis": result,
                        "resume_text": extracted_text[:5000],
                        "resume_file_name": file_name,
                        "job_description": job_description or "",
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }},
                    upsert=True
                )
                logger.info(f"✅ Saved interview data for user: {user_id}")
            except Exception as db_err:
                logger.error(f"DB save error: {db_err}")
        
        # Return extracted text for frontend
        result["extracted_text"] = extracted_text[:2000]
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in resume analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/interview/generate-questions")
async def generate_interview_questions(payload: Dict[str, Any]):
    """
    Generates tailored interview questions based on resume and JD.
    """
    try:
        resume_text = payload.get("resume_text", "")[:2000]
        jd_text = payload.get("job_description", "")[:1500]
        level = payload.get("level", 1)
        question_count = min(payload.get("question_count", 12), 15)
        user_id = payload.get("user_id")
        
        # Determine role from JD
        role = "General"
        if jd_text:
            lines = jd_text.split('\n')[:5]
            for line in lines:
                clean_line = line.strip()
                if any(kw in clean_line.lower() for kw in ['looking for', 'seeking', 'role', 'position', 'require']):
                    if len(clean_line) > 10:
                        role = clean_line[:80]
                        break
        
        # Count types for balanced questions
        types_required = {
            "behavioral": max(2, question_count // 4),
            "technical": max(2, question_count // 4),
            "situational": max(1, question_count // 5),
            "culture": max(1, question_count // 6),
            "problem_solving": max(1, question_count // 5)
        }
        
        # Adjust to match total
        total_assigned = sum(types_required.values())
        if total_assigned < question_count:
            remaining = question_count - total_assigned
            types_required["behavioral"] += remaining // 2
            types_required["technical"] += remaining - (remaining // 2)
        
        system_prompt = f"""You are a senior hiring manager. Generate interview questions for a {role} role.
        Question distribution: Behavioral: {types_required['behavioral']}, Technical: {types_required['technical']}, 
        Situational: {types_required['situational']}, Culture: {types_required['culture']}, 
        Problem Solving: {types_required['problem_solving']}
        
        Return ONLY valid JSON with:
        {{"questions": [
            {{"id": "q1", "type": "behavioral", "question": "...", "category": "...", 
              "difficulty": "Beginner/Intermediate/Advanced", 
              "sample_answer": "...", 
              "key_points": ["p1","p2"], 
              "common_mistakes": ["m1"], 
              "follow_up_hint": "..."}}
        ], "summary": "Brief overview of question set"}}"""
        
        user_prompt = f"""Role: {role}
        Skills from resume: {resume_text[:500] if resume_text else 'Not provided'}
        Job Requirements: {jd_text[:500] if jd_text else 'Not provided'}
        Level: {level}
        Generate {question_count} interview questions in valid JSON format.
        Make questions specific to the role and tailored to the candidate's background.
        """
        
        try:
            result = await call_llm_with_fallback(system_prompt, user_prompt, temperature=0.85)
        except Exception as llm_err:
            logger.error(f"LLM question generation failed: {llm_err}")
            fallback_questions = generate_fallback_questions(role, question_count)
            result = {"questions": fallback_questions, "summary": "Generated fallback questions"}
        
        if "questions" not in result or not result["questions"]:
            fallback_questions = generate_fallback_questions(role, question_count)
            result = {"questions": fallback_questions, "summary": "Generated fallback questions"}
        
        if len(result["questions"]) > question_count:
            result["questions"] = result["questions"][:question_count]
        
        # Ensure each question has required fields
        for q in result["questions"]:
            q.setdefault("id", f"q{result['questions'].index(q) + 1}")
            q.setdefault("type", "behavioral")
            q.setdefault("difficulty", "Intermediate")
            q.setdefault("sample_answer", "Provide a structured answer using STAR method.")
            q.setdefault("key_points", ["Clear communication", "Specific example"])
            q.setdefault("common_mistakes", ["Being too vague"])
            q.setdefault("follow_up_hint", "Can you elaborate on that?")
            q.setdefault("category", role if role != "General" else "General")
        
        # Save to database
        if user_id:
            try:
                await db.interview_data.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "generated_questions": result["questions"],
                        "questions_summary": result.get("summary", ""),
                        "question_count": len(result["questions"]),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }},
                    upsert=True
                )
            except Exception as db_err:
                logger.error(f"DB save error: {db_err}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error generating questions: {e}")
        return {
            "questions": generate_fallback_questions("General", 10),
            "summary": "Generated fallback questions due to error"
        }


# ==========================================
# ENHANCED /interview/practice WITH HR-STYLE FEEDBACK
# ==========================================
@api_router.post("/interview/practice")
async def interview_practice(payload: InterviewPracticeRequest):
    """
    Handles the practice interview conversation and returns HR‑style feedback.
    """
    try:
        question = payload.question
        user_answer = payload.user_answer
        context = payload.context or {}
        
        conversation = context.get("conversation", [])
        
        history_text = "\n".join([
            f"Interviewer: {msg.get('question', '')}" if msg.get('role') == 'interviewer' 
            else f"Candidate: {msg.get('answer', '')}"
            for msg in conversation[-5:]
        ])
        
        # Enhanced system prompt for HR-style feedback
        system_prompt = """
        You are an experienced HR interviewer and career coach. 
        Evaluate the candidate's answer and provide **detailed, actionable feedback**.
        Return a JSON object with the following keys:
        - "evaluation": A short overall assessment (2‑3 sentences).
        - "strengths": List of 2‑4 specific strengths of the answer.
        - "improvements": List of 2‑4 specific areas that need improvement.
        - "score": A numeric score from 0‑100.
        - "follow_up_question": A natural follow‑up question to continue the conversation.
        - "tip": One practical tip to improve future answers.
        - "key_points_covered": List of 2‑3 key points the candidate successfully addressed.
        - "communication_style": Brief feedback on clarity, structure, confidence, and use of language.
        - "suggested_improvement": A concrete suggestion on how to improve the answer (e.g., using STAR, adding metrics, etc.).
        Keep the feedback constructive and encouraging.
        """
        
        user_prompt = f"""
        Question: {question}
        Answer: {user_answer}
        {f"History of previous Q&A (for context):\n{history_text}" if history_text else ""}
        Provide a thorough evaluation in valid JSON.
        """
        
        result = await call_llm_with_fallback(system_prompt, user_prompt, temperature=0.7)
        
        # Set defaults to ensure all keys exist
        result.setdefault("evaluation", "Good attempt. Keep practising!")
        result.setdefault("strengths", ["Clear communication"])
        result.setdefault("improvements", ["Add more specific examples"])
        result.setdefault("score", 70)
        result.setdefault("follow_up_question", "Can you elaborate on that?")
        result.setdefault("tip", "Use the STAR method for behavioural questions.")
        result.setdefault("key_points_covered", ["Addressed the main question", "Showed understanding of the problem"])
        result.setdefault("communication_style", "Clear and confident, but could be more structured.")
        result.setdefault("suggested_improvement", "Try to quantify your achievements and use the STAR framework.")
        
        return result
        
    except Exception as e:
        logger.error(f"Error in interview practice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/interview/feedback")
async def interview_feedback(payload: InterviewFeedbackRequest):
    """
    Generates comprehensive feedback after the practice session.
    """
    try:
        conversation = payload.conversation
        job_role = payload.job_role or "General"
        level = payload.level or 1
        
        conversation_text = "\n".join([
            f"Q: {msg.get('question', '')}\nA: {msg.get('answer', '')}"
            for msg in conversation
        ])
        
        system_prompt = """
        You are a senior career coach. Analyze the interview and provide feedback.
        Return JSON with: overall_score, summary, strengths, weaknesses, communication, 
        technical_skills, behavioral_skills, improvement_areas, tips, 
        recommended_resources, confidence_boost, next_steps.
        """
        
        user_prompt = f"""
        Role: {job_role}
        Level: {level}
        Conversation: {conversation_text[:3000]}
        Provide comprehensive feedback.
        """
        
        result = await call_llm_with_fallback(system_prompt, user_prompt, temperature=0.3)
        
        result.setdefault("overall_score", 70)
        result.setdefault("summary", "Good performance with room for improvement.")
        result.setdefault("strengths", ["Good communication"])
        result.setdefault("weaknesses", ["Need more specific examples"])
        result.setdefault("communication", {"clarity": "Good", "confidence": "Good", "structure": "Could improve"})
        result.setdefault("technical_skills", "Shows basic understanding")
        result.setdefault("behavioral_skills", "Good but need more STAR examples")
        result.setdefault("improvement_areas", [
            {"area": "Specific examples", "suggestion": "Use STAR method", "priority": "High"}
        ])
        result.setdefault("tips", ["Practice your answers out loud"])
        result.setdefault("recommended_resources", [
            {"topic": "STAR Method", "suggestion": "Learn to structure answers"}
        ])
        result.setdefault("confidence_boost", "You're doing great! Keep practicing.")
        result.setdefault("next_steps", ["Review feedback", "Practice more", "Prepare questions"])
        
        return result
        
    except Exception as e:
        logger.error(f"Error in interview feedback: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/interview/session/{user_id}")
async def get_interview_session(user_id: str):
    """
    Retrieves all interview preparation data for a user.
    """
    try:
        data = await db.interview_data.find_one({"user_id": user_id})
        if not data:
            return {
                "resume_analysis": None,
                "generated_questions": [],
                "practice_sessions": [],
                "feedback_history": [],
                "resume_text": "",
                "job_description": "",
                "has_data": False
            }
        
        data.pop("_id", None)
        data["has_data"] = True
        return data
        
    except Exception as e:
        logger.error(f"Error fetching interview session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/interview/save-session")
async def save_interview_session(payload: Dict[str, Any]):
    """
    Saves a completed practice session.
    """
    try:
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")
        
        session_data = {
            "date": datetime.now(timezone.utc).isoformat(),
            "questions": payload.get("questions", []),
            "answers": payload.get("answers", []),
            "feedback": payload.get("feedback", {}),
            "score": payload.get("score", 0)
        }
        
        await db.interview_data.update_one(
            {"user_id": user_id},
            {
                "$push": {"practice_sessions": session_data},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            },
            upsert=True
        )
        
        return {"success": True, "message": "Session saved successfully"}
        
    except Exception as e:
        logger.error(f"Error saving interview session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# INTERVIEW JD ANALYSIS (JSON endpoint) - NEW
# ==========================================
@api_router.post("/interview/analyze-jd")
async def analyze_jd(payload: Dict[str, Any]):
    """
    Analyzes Job Description only (JSON endpoint for JD analysis).
    """
    try:
        jd_text = payload.get("job_description", "")
        resume_text = payload.get("resume_text", "Resume not provided")
        user_id = payload.get("user_id")
        
        if not jd_text or not jd_text.strip():
            raise HTTPException(status_code=400, detail="Job Description is required")
        
        # Truncate
        if len(jd_text) > 1500:
            jd_text = jd_text[:1500] + "..."
        if len(resume_text) > 2000:
            resume_text = resume_text[:2000] + "..."
        
        system_prompt = """You are an expert ATS (Applicant Tracking System) resume reviewer and career coach. 
        Analyze the Job Description and provide structured feedback on how well the resume matches.
        
        IMPORTANT: Return ONLY valid JSON with these exact keys:
        - extracted_skills: array of key skills required in the JD
        - strengths: array of 3-4 strengths (how resume matches JD)
        - weaknesses: array of 3-4 gaps (what's missing)
        - ats_score: number between 0-100 (match percentage)
        - missing_keywords: array of important keywords from JD missing in resume
        - improvement_suggestions: array of objects with "section" and "suggestion"
        - formatting_tips: array of formatting suggestions
        - overall_rating: string ("Excellent", "Good", "Average", "Poor")
        - summary_feedback: string with overall feedback
        
        Keep each item short and actionable. Maximum 4 items per array.
        """
        
        user_prompt = f"""
        Job Description:
        {jd_text}
        
        Resume (for comparison):
        {resume_text}
        
        Provide structured feedback in valid JSON format.
        """
        
        try:
            result = await call_llm_with_fallback(system_prompt, user_prompt, temperature=0.3)
        except Exception as llm_err:
            logger.error(f"LLM analysis failed: {llm_err}")
            result = generate_fallback_analysis(jd_text)
        
        # Ensure all fields exist
        result.setdefault("extracted_skills", ["Communication", "Problem Solving", "Teamwork"])
        result.setdefault("strengths", ["Clear communication", "Good technical foundation"])
        result.setdefault("weaknesses", ["Could provide more specific examples", "Missing quantifiable achievements"])
        result.setdefault("ats_score", 65)
        result.setdefault("missing_keywords", ["data analysis", "project management", "leadership"])
        result.setdefault("improvement_suggestions", [
            {"section": "Experience", "suggestion": "Add specific metrics and achievements"},
            {"section": "Skills", "suggestion": "Include more relevant technical skills"}
        ])
        result.setdefault("formatting_tips", ["Use bullet points for readability", "Keep consistent formatting"])
        result.setdefault("overall_rating", "Average")
        result.setdefault("summary_feedback", "The resume needs better alignment with the job description.")
        
        # Save to database
        if user_id:
            try:
                await db.interview_data.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "resume_analysis": result,
                        "job_description": payload.get("job_description", ""),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }},
                    upsert=True
                )
                logger.info(f"✅ Saved JD analysis for user: {user_id}")
            except Exception as db_err:
                logger.error(f"DB save error: {db_err}")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in JD analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# INTERVIEW VOICE TRANSCRIPTION ENDPOINT - NEW
# ==========================================
@api_router.post("/interview/voice-transcribe")
async def interview_voice_transcribe(
    audio: UploadFile = File(...),
    history: str = Form(default="[]")
):
    """
    Transcribes voice for interview practice using the same working method as talking bot.
    """
    try:
        audio_bytes = await audio.read()
        filename = audio.filename or "voice_note.webm"
        logger.info(f"🎙️ Interview voice: Received audio file: {filename}, Size: {len(audio_bytes)} bytes")

        user_spoken_text = None
        transcription_method = None

        # METHOD 1: Try faster-whisper (if available)
        if FASTER_WHISPER_AVAILABLE and local_whisper:
            try:
                user_spoken_text = await transcribe_locally(audio_bytes)
                if user_spoken_text and len(user_spoken_text.strip()) > 0:
                    transcription_method = "faster-whisper"
                    logger.info(f"✅ faster-whisper: '{user_spoken_text}'")
            except Exception as e:
                logger.warning(f"⚠️ faster-whisper failed: {e}")
                user_spoken_text = None

        # METHOD 2: Try Google Speech Recognition with better format handling
        if not user_spoken_text or len(user_spoken_text.strip()) == 0:
            try:
                import speech_recognition as sr
                import tempfile
                import os
                import subprocess
                from pydub import AudioSegment
                
                with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp_webm:
                    temp_webm.write(audio_bytes)
                    webm_path = temp_webm.name
                
                wav_path = webm_path.replace('.webm', '.wav')
                
                try:
                    audio_segment = AudioSegment.from_file(webm_path, format="webm")
                    audio_segment.export(wav_path, format="wav")
                except Exception as e:
                    logger.warning(f"pydub conversion failed: {e}")
                    try:
                        subprocess.run(
                            ['ffmpeg', '-i', webm_path, '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', wav_path],
                            capture_output=True, check=True
                        )
                    except:
                        logger.warning("ffmpeg conversion failed, using raw")
                        wav_path = webm_path
                
                recognizer = sr.Recognizer()
                with sr.AudioFile(wav_path) as source:
                    recognizer.adjust_for_ambient_noise(source, duration=0.5)
                    audio_data = recognizer.record(source)
                    
                    languages = ["en-US", "en-IN", "mr-IN", "hi-IN"]
                    for lang in languages:
                        try:
                            user_spoken_text = recognizer.recognize_google(audio_data, language=lang)
                            if user_spoken_text and len(user_spoken_text.strip()) > 0:
                                transcription_method = f"google-speech-{lang}"
                                logger.info(f"✅ Google Speech ({lang}): '{user_spoken_text}'")
                                break
                        except Exception as e:
                            logger.warning(f"Google Speech {lang} failed: {e}")
                            continue
                
                try:
                    os.unlink(webm_path)
                    if os.path.exists(wav_path) and wav_path != webm_path:
                        os.unlink(wav_path)
                except:
                    pass
                    
            except Exception as e:
                logger.warning(f"⚠️ Google Speech failed: {e}")
                user_spoken_text = None

        # METHOD 3: Try Vosk as fallback with proper wav conversion
        if not user_spoken_text or len(user_spoken_text.strip()) == 0:
            try:
                import vosk
                import wave
                import json
                import tempfile
                import os
                from pydub import AudioSegment
                
                model_path = "models/vosk-model-small-en-us-0.15"
                if not os.path.exists(model_path):
                    logger.info("📥 Downloading Vosk model...")
                    os.makedirs("models", exist_ok=True)
                    import urllib.request
                    import zipfile
                    url = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
                    zip_path = "models/vosk-model.zip"
                    urllib.request.urlretrieve(url, zip_path)
                    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                        zip_ref.extractall("models")
                    os.remove(zip_path)
                    logger.info("✅ Vosk model downloaded!")
                
                with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp_webm:
                    temp_webm.write(audio_bytes)
                    webm_path = temp_webm.name
                
                wav_path = webm_path.replace('.webm', '.wav')
                audio_segment = AudioSegment.from_file(webm_path, format="webm")
                audio_segment = audio_segment.set_frame_rate(16000).set_channels(1)
                audio_segment.export(wav_path, format="wav")
                
                model = vosk.Model(model_path)
                rec = vosk.KaldiRecognizer(model, 16000)
                
                wf = wave.open(wav_path, "rb")
                full_text = []
                while True:
                    data = wf.readframes(4000)
                    if len(data) == 0:
                        break
                    if rec.AcceptWaveform(data):
                        result = json.loads(rec.Result())
                        text = result.get("text", "")
                        if text:
                            full_text.append(text)
                
                user_spoken_text = " ".join(full_text)
                
                try:
                    os.unlink(webm_path)
                    os.unlink(wav_path)
                except:
                    pass
                
                if user_spoken_text and len(user_spoken_text.strip()) > 0:
                    transcription_method = "vosk"
                    logger.info(f"✅ Vosk: '{user_spoken_text}'")
                    
            except Exception as e:
                logger.warning(f"⚠️ Vosk failed: {e}")
                user_spoken_text = None

        # Return result
        if not user_spoken_text or len(user_spoken_text.strip()) == 0:
            logger.error("❌ All transcription methods failed")
            return {
                "transcribed_text": "",
                "success": False,
                "error": "Could not transcribe voice. Please type your answer."
            }
        
        return {
            "transcribed_text": user_spoken_text,
            "success": True,
            "method": transcription_method or "unknown"
        }

    except Exception as e:
        logger.error(f"❌ Error in interview voice transcribe: {e}")
        return {
            "transcribed_text": "",
            "success": False,
            "error": str(e)
        }


# ==========================================
# AUTH & USER ENDPOINTS
# ==========================================
@api_router.post("/auth/login")
async def login(user: UserLogin):
    try:
        existing = await db.users.find_one({"contact": user.contact})
        if existing:
            existing.pop("_id", None)
            return existing

        new_user = {
            "id": str(uuid.uuid4()),
            "name": user.name,
            "contact": user.contact,
            "level": 1,
            "xp": 0,
            "streak": 0,
            "last_active": datetime.now(timezone.utc).isoformat(),
            "badges": [],
            "skills": {
                "reading": 0,
                "writing": 0,
                "speaking": 0,
                "listening": 0,
                "interview": 0,
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        await db.users.insert_one(new_user)
        new_user.pop("_id", None)
        return new_user
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/me")
async def get_current_user(x_user_id: Optional[str] = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID header missing")
    user = await db.users.find_one({"id": x_user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.pop("_id", None)
    return user


# ==========================================
# CHAPTER GENERATION ENDPOINTS
# ==========================================
@api_router.post("/reading/chapter")
async def get_or_generate_chapter(payload: ChapterGenerationRequest):
    try:
        return await process_chapter_generation(
            user_id=payload.user_id or "default_user",
            raw_domain=payload.domain or "Finance & Wealth",
            chapter_number=payload.chapter_number or 1
        )
    except Exception as e:
        logger.error(f"Error in chapter generation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/generate-passage")
async def generate_passage_legacy(payload: Optional[Dict[str, Any]] = None):
    try:
        data = payload or {}
        user_id = data.get("user_id", "default_user")
        domain = data.get("domain", data.get("topic", "Finance & Wealth"))
        chapter_number = int(data.get("chapter_number", data.get("chapter", 1)))
        
        return await process_chapter_generation(
            user_id=user_id,
            raw_domain=domain,
            chapter_number=chapter_number
        )
    except Exception as e:
        logger.error(f"Error in generate-passage legacy route: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# WRITING PROMPT & EVALUATION ENDPOINTS
# ==========================================
@api_router.post("/groq-writing-prompt")
async def generate_writing_prompt(req: Optional[WritingPromptRequest] = None):
    """Generate a dynamic writing/essay prompt for Marathi speakers learning English."""
    if req is None:
        req = WritingPromptRequest()

    selected_category = req.category or random.choice(WRITING_CATEGORIES)
    random_seed = int(time.time() * 1000) % 10000

    system_prompt = (
        "You are an expert English language tutor creating writing topics for Marathi speakers learning English. "
        f"Generate a brand-new, unique writing topic under the theme: '{selected_category}' suitable for Level {req.level} students. "
        "Do NOT repeat generic overused topics. Make it interesting and specific. "
        "Provide an English title, Marathi translation, and 3 to 4 guidance hints written in Marathi. "
        "You MUST respond strictly in valid JSON without markdown formatting."
    )

    user_prompt = f"""
    Batch Seed: {random_seed}
    Return JSON in this exact structure:
    {{
      "title_en": "Engaging essay/writing prompt topic in English",
      "title_mr": "निबंधाच्या विषयाचे सोपे आणि स्पष्ट मराठी भाषांतर",
      "hints": [
        "प्रस्तावना (Introduction): ...",
        "मुख्य भाग (Main Body): ...",
        "निष्कर्ष (Conclusion): ..."
      ]
    }}
    """

    try:
        result = await call_llm_with_fallback(system_prompt, user_prompt, temperature=0.9)
        if "title_en" not in result or "title_mr" not in result or "hints" not in result:
            logger.warning("Incomplete prompt data from LLM, using fallback")
            return random.choice(FALLBACK_WRITING_PROMPTS)
        return result
    except Exception as e:
        logger.error(f"Error in prompt generation: {e}")
        return random.choice(FALLBACK_WRITING_PROMPTS)


@api_router.post("/groq-eval-writing")
async def evaluate_writing(req: WritingEvalRequest):
    """Evaluate a student's essay with feedback in Marathi."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Essay text cannot be empty.")

    system_prompt = (
        "You are an expert English teacher evaluating an essay written by a Marathi student. "
        "All feedback text MUST BE STRICTLY WRITTEN IN MARATHI (मराठी). "
        "Evaluate grammar, relevance to prompt, and sentence structure. "
        "Return the evaluation strictly in valid JSON without markdown formatting."
    )

    user_prompt = f"""
    Topic (English): {req.prompt}
    Student's Essay:
    "{req.text}"

    Return JSON in this exact structure:
    {{
      "score": "8.5 / 10",
      "overall": "मराठीत संपूर्ण अभिप्राय (Overall summary in Marathi)",
      "strengths": [
        "चांगली गोष्ट १ (Strength 1 in Marathi)",
        "चांगली गोष्ट २ (Strength 2 in Marathi)"
      ],
      "improvements": [
        "सुधारणेची टीप १ (Area to improve 1 in Marathi)",
        "सुधारणेची टीप २ (Area to improve 2 in Marathi)"
      ],
      "correction": "💡 सुधारित व्याकरण टीप किंवा वाक्यरचना (Grammar correction tip in Marathi)"
    }}
    """

    try:
        return await call_llm_with_fallback(system_prompt, user_prompt, temperature=0.3)
    except Exception as e:
        logger.error(f"Error in evaluation: {e}")
        return {
            "score": "8 / 10",
            "overall": "तुमचे लेखन अतिशय छान आणि विषयाला धरून आहे!",
            "strengths": [
                "वाक्यरचना सोपी आणि योग्य आहे.",
                "निबंधाचा विषय व्यवस्थित मांडला आहे."
            ],
            "improvements": [
                "वाक्याची सुरुवात करताना पहिले अक्षर Capital ठेवा.",
                "व्याकरणातील लहान-सहान चुकांकडे लक्ष द्या."
            ],
            "correction": "💡 टीप: नेहमी योग्य विरामचिन्हांचा (Punctuation) वापर करा."
        }


# ==========================================
# ENHANCED TALKING BOT - WITH PER-MESSAGE METRICS
# ==========================================
@api_router.post("/groq-talk-bot")
async def groq_talk_bot(payload: TalkBotRequest):
    """
    WhatsApp-style interactive conversation partner with:
    - Proper English/Marathi blend based on user's level
    - Bilingual (Marathi + English) grammar corrections
    - Per-message metrics for each user message
    - NO "सुधारलंय" in first message
    """
    try:
        # Get the last user message
        last_user_message = None
        user_message_count = 0
        for msg in payload.conversation:
            if msg.sender == "user":
                last_user_message = msg.text
                user_message_count += 1
        
        # Check if this is the FIRST message
        is_initial = (user_message_count == 0)
        
        if hasattr(payload, 'is_initial_greeting') and payload.is_initial_greeting:
            is_initial = True
        
        if not last_user_message:
            last_user_message = "Hello"
        
        level = payload.level or 1
        english_percent = payload.english_percent if hasattr(payload, 'english_percent') else 50
        day = payload.day if hasattr(payload, 'day') else 1
        
        # Format conversation history
        conversation_history = []
        user_messages = []
        for msg in payload.conversation:
            if msg.sender == "user":
                conversation_history.append(f"Student: {msg.text}")
                user_messages.append(msg.text)
            else:
                conversation_history.append(f"Teacher: {msg.text}")
        
        history_text = "\n".join(conversation_history[-12:])
        
        # Calculate actual English/Marathi ratio from user's messages
        total_english_words = 0
        total_marathi_words = 0
        for msg in user_messages:
            english_words = len(re.findall(r'[a-zA-Z]+', msg))
            marathi_words = len(re.findall(r'[\u0900-\u097F]+', msg))
            total_english_words += english_words
            total_marathi_words += marathi_words
        
        # Determine English percentage for response
        if total_english_words > 0 or total_marathi_words > 0:
            user_english_percent = (total_english_words / (total_english_words + total_marathi_words)) * 100
        else:
            user_english_percent = 20
        
        # Blend based on user's level and usage
        target_english_percent = min(80, max(20, user_english_percent + (level * 2)))
        base_percent = english_percent if english_percent > 0 else 30
        
        if is_initial:
            english_ratio = max(30, min(40, base_percent))
        else:
            english_ratio = max(30, min(80, target_english_percent))
            
        if level >= 3 and english_ratio < 40:
            english_ratio = 40
        elif level >= 5 and english_ratio < 50:
            english_ratio = 50
        
        marathi_ratio = 100 - english_ratio
        
        logger.info(f"📝 English/Marathi ratio: {english_ratio}% English, {marathi_ratio}% Marathi")
        logger.info(f"📝 User's English usage: {user_english_percent:.1f}%")
        
        # ==========================================
        # NEW: Calculate per-message metrics for the user's last message
        # ==========================================
        message_metrics = analyze_message_metrics(last_user_message)
        logger.info(f"📊 Message metrics: {message_metrics}")
        
        if is_initial:
            # ==========================================
            # FIRST MESSAGE - NO "सुधारलंय"
            # ==========================================
            
            # Generate dynamic topic
            topic_system_prompt = (
                "You are a creative conversation designer for English learners. "
                f"Today is Day {day} of their learning journey. "
                "Generate a UNIQUE, creative, and interesting conversation starter. "
                "Make it relatable, personal, and simple for a beginner. "
                "DO NOT use 'सुधारलंय' or 'improved' or any improvement-related words. "
                "Return ONLY valid JSON with these keys: "
                "topic, question, question_mr, marathi_intro, follow_up, fun_fact"
            )
            topic_user_prompt = (
                f"Day {day}. Student Level: {level}. "
                "Generate a fresh, unique conversation starter topic. "
                "Make it interesting but simple. "
                "Return ONLY valid JSON."
            )
            
            topic_data = await call_llm_with_fallback(topic_system_prompt, topic_user_prompt, temperature=0.9)
            
            topic_data.setdefault("topic", "Your Day")
            topic_data.setdefault("question", "How was your day today?")
            topic_data.setdefault("question_mr", "आजचा दिवस कसा गेला?")
            topic_data.setdefault("marathi_intro", "आपण आजच्या दिवसाबद्दल बोलूया!")
            topic_data.setdefault("follow_up", "What made your day special?")
            topic_data.setdefault("fun_fact", "Every day is a new opportunity to learn something new!")
            
            logger.info(f"✨ Generated topic for Day {day}: {topic_data.get('topic')}")
            
            # Generate greeting
            greeting_system_prompt = (
                "You are a warm, friendly WhatsApp conversation partner. "
                "This is the FIRST message. The student is a BEGINNER. "
                f"Topic: {topic_data.get('topic')} "
                f"Question: {topic_data.get('question')} "
                f"Marathi intro: {topic_data.get('marathi_intro')} "
                f"English ratio: {english_ratio}% English, {marathi_ratio}% Marathi "
                "CRITICAL RULES: "
                "1. DO NOT use 'सुधारलंय' or 'improved' - they haven't spoken yet! "
                "2. Focus on them STARTING their journey, not improving. "
                "3. Give a warm, welcoming greeting. "
                "4. Use BOTH English and Marathi in the response. "
                "5. Ask the question in English and also explain in Marathi. "
                "Return JSON: "
                "{\"reply\": \"Warm greeting with the question (mix of English and Marathi)\", "
                "\"feedback_mr\": \"Marathi encouragement (NO improvement words)\", "
                "\"soft_skill_tip\": \"Helpful tip for beginners (in English)\"}"
            )
            greeting_user_prompt = (
                f"Day {day}. Generate a warm first message for a beginner. "
                f"Topic: {topic_data.get('topic')} "
                f"Question: {topic_data.get('question')} "
                f"Marathi version: {topic_data.get('question_mr')} "
                f"Marathi intro: {topic_data.get('marathi_intro')} "
                f"Use about {english_ratio}% English and {marathi_ratio}% Marathi in the reply. "
                "Make it warm, personal, and conversational. "
                "NO improvement words like सुधारलंय, सुधारत, improved, improving."
            )
            
            result = await call_llm_with_fallback(greeting_system_prompt, greeting_user_prompt, temperature=0.8)
            
            result["daily_topic"] = topic_data.get("topic")
            result["question"] = topic_data.get("question")
            result["question_mr"] = topic_data.get("question_mr")
            result["marathi_intro"] = topic_data.get("marathi_intro")
            result["fun_fact"] = topic_data.get("fun_fact")
            result["follow_up"] = topic_data.get("follow_up")
            result["english_ratio"] = english_ratio
            
            # NEW: Add message metrics to initial greeting response
            result["message_metrics"] = message_metrics
            
            result["reply"] = result.get("reply", f"Namaste! Day {day} - Let's talk about {topic_data.get('topic')}! {topic_data.get('question')} ({topic_data.get('question_mr')})")
            result["feedback_mr"] = result.get("feedback_mr", f"तुम्ही इंग्रजी शिकायला सुरुवात केली आहे, खूप छान! {topic_data.get('marathi_intro')}")
            result["soft_skill_tip"] = result.get("soft_skill_tip", "Start with simple words like 'Hello', 'How are you?'")
            
            if "सुधारलंय" in result["feedback_mr"] or "सुधारत" in result["feedback_mr"]:
                result["feedback_mr"] = f"तुम्ही इंग्रजी शिकायला सुरुवात केली आहे, खूप छान! {topic_data.get('marathi_intro', 'आजच्या विषयाबद्दल बोलूया!')}"
            
            if "सुधारलंय" in result["reply"] or "सुधारत" in result["reply"]:
                result["reply"] = f"Namaste! Day {day} - Let's talk about {topic_data.get('topic', 'Your Day')}! {topic_data.get('question', 'How are you?')} ({topic_data.get('question_mr', 'आज तुम्हाला कसे वाटत आहे?')})"
            
            return result
            
        else:
            # ==========================================
            # NON-INITIAL MESSAGES - BILINGUAL CORRECTIONS + METRICS
            # ==========================================
            exchange_count = user_message_count
            
            # Different encouragement based on exchange count
            if exchange_count <= 2:
                encouragement_msg = "तुम्ही इंग्रजी बोलायला सुरुवात केली आहे, ही खूप चांगली गोष्ट आहे! असेच चालू ठेवा."
                feedback_mr_default = "तुम्ही इंग्रजी बोलायला सुरुवात केली आहे, ही खूप चांगली गोष्ट आहे! असेच चालू ठेवा."
                
            elif exchange_count <= 5:
                encouragement_msg = "तुम्ही चांगले इंग्रजी बोलत आहात! असेच सराव करा."
                feedback_mr_default = "तुम्ही चांगले इंग्रजी बोलत आहात! असेच सराव करा."
                
            else:
                encouragement_msg = "तुमचं इंग्रजी सुधारत आहे, माझ्यासोबत प्रॅक्टिस करा!"
                feedback_mr_default = "तुमचं इंग्रजी सुधारत आहे, माझ्यासोबत प्रॅक्टिस करा!"
            
            logger.info(f"📝 Exchange {exchange_count}: Using '{encouragement_msg}'")
            logger.info(f"📝 English/Marathi ratio: {english_ratio}% English, {marathi_ratio}% Marathi")
            
            # System prompt with bilingual correction capabilities
            system_prompt = (
                "You are a warm, friendly WhatsApp conversation partner and English practice buddy. "
                f"English/Marathi ratio: Use about {english_ratio}% English and {marathi_ratio}% Marathi. "
                f"Incorporate encouragement: '{encouragement_msg}' "
                "CRITICAL RULES FOR FEEDBACK (MUST BE BILINGUAL): "
                "1. Respond DIRECTLY to what the student said. "
                "2. Identify SPECIFIC grammar/vocabulary mistakes in their message. "
                "3. Show the WRONG way and the CORRECT way. "
                "4. If they used Marathi words, show how to say it in English. "
                "5. Give the CORRECT ENGLISH version of what they should have said. "
                "6. EXPLAIN THE RULE IN BOTH MARATHI AND ENGLISH for better understanding. "
                "7. Format feedback as: "
                "   - 'You said: [their wrong sentence]' "
                "   - 'Correct way: [correct English sentence]' "
                "   - 'In English: [full English translation]' "
                "   - '💡 Tip: [Explanation in Marathi] / [Same explanation in English]' "
                "8. ALWAYS ask a follow-up question. "
                "Return JSON: "
                "{\"reply\": \"Natural response with follow-up question (mix of English and Marathi)\", "
                "\"feedback_mr\": \"Marathi feedback with specific corrections and English translations\", "
                "\"soft_skill_tip\": \"Bilingual English tip (Marathi + English explanation)\"}"
            )
            
            user_prompt = (
                f"Conversation History:\n{history_text}\n\n"
                f"Student's latest message: '{last_user_message}'\n\n"
                f"Respond naturally as a supportive WhatsApp buddy. "
                f"Use about {english_ratio}% English and {marathi_ratio}% Marathi. "
                "IMPORTANT FORMAT FOR FEEDBACK: "
                "1. First, reply to what they said (acknowledge their point). "
                "2. Then give correction: "
                "   - 'You said: [their wrong sentence]' "
                "   - 'Correct way: [correct English sentence]' "
                "   - 'In English you can say: [full English translation]' "
                "   - '💡 Tip: [Explain the grammar rule in Marathi] / [Same explanation in English]' "
                "3. Ask a follow-up question. "
                "Make it encouraging but helpful - one correction at a time."
            )
            
            result = await call_llm_with_fallback(system_prompt, user_prompt, temperature=0.8)
            
            # Ensure all required fields exist
            result["reply"] = result.get("reply", "That's interesting! Can you tell me more about that? (तुम्ही आणखी काही सांगू शकता?)")
            result["feedback_mr"] = result.get("feedback_mr", feedback_mr_default)
            result["soft_skill_tip"] = result.get("soft_skill_tip", "Try to use more English words in your sentences.")
            result["english_ratio"] = english_ratio
            
            # NEW: Add per-message metrics to response
            result["message_metrics"] = message_metrics
            
            return result
        
    except Exception as e:
        logger.error(f"Error in groq-talk-bot: {e}")
        return {
            "reply": "Hello! Welcome to your English practice session. How are you feeling today? (तुम्हाला आज कसे वाटत आहे?)",
            "feedback_mr": "तुम्ही इंग्रजी शिकायला सुरुवात केली आहे, खूप छान! आजचा दिवस कसा आहे?",
            "soft_skill_tip": "Start with simple words like 'Hello', 'How are you?'",
            "daily_topic": "Getting Started",
            "question": "How are you feeling today?",
            "question_mr": "आज तुम्हाला कसे वाटत आहे?",
            "marathi_intro": "आपण आजच्या दिवसाबद्दल बोलूया!",
            "fun_fact": "Every day is a new opportunity to learn something new!",
            "follow_up": "What would you like to talk about?",
            "english_ratio": 40,
            "message_metrics": {
                "fluency": 0,
                "grammar": 0,
                "vocabulary": 0,
                "pronunciation": 0,
                "confidence": 0,
                "word_count": 0,
                "english_words": 0,
                "marathi_words": 0,
                "english_percentage": 0,
                "grammar_errors": 0,
                "vocabulary_suggestions": [],
                "pronunciation_hints": [],
                "feedback_short": "Please say something!"
            }
        }


# ==========================================
# ENHANCED SESSION METRICS
# ==========================================
@api_router.post("/groq-session-metrics")
async def groq_session_metrics(payload: MetricsRequest):
    """Calculates detailed evaluation metrics at the end of a speaking session."""
    try:
        user_messages = [msg.text for msg in payload.conversation if msg.sender == "user"]
        
        if not user_messages:
            return {
                "fluencyScore": 0,
                "confidenceScore": 0,
                "pronunciationScore": 0,
                "vocabularyScore": 0,
                "grammarScore": 0,
                "feedback_mr": "कोणतेही संभाषण आढळले नाही. कृपया पुढील सत्रात अधिक बोला.",
                "totalMessages": 0,
                "averageWordsPerMessage": 0,
                "sessionLength": len(payload.conversation),
                "message": "No user messages found in session"
            }
        
        total_words = sum(len(msg.split()) for msg in user_messages)
        total_marathi_words = 0
        total_english_words = 0
        
        for msg in user_messages:
            marathi_words = len(re.findall(r'[\u0900-\u097F]+', msg))
            english_words = len(re.findall(r'[a-zA-Z]+', msg))
            
            total_marathi_words += marathi_words
            total_english_words += english_words
        
        avg_words_per_message = total_words / len(user_messages) if user_messages else 0
        questions_asked = sum(1 for msg in user_messages if "?" in msg)
        question_ratio = questions_asked / len(user_messages) if user_messages else 0
        
        all_words = " ".join(user_messages).lower().split()
        unique_words = len(set(all_words)) if all_words else 0
        vocab_ratio = unique_words / (len(all_words) or 1)
        
        fluency_score = min(95, 60 + (avg_words_per_message * 3)) if user_messages else 0
        confidence_score = min(95, 55 + (question_ratio * 40) + (avg_words_per_message * 2)) if user_messages else 0
        vocab_score = min(95, 50 + (vocab_ratio * 100 * 0.45)) if user_messages else 0
        grammar_score = min(95, 70 + (avg_words_per_message * 1.5) - (10 if avg_words_per_message < 3 else 0)) if user_messages else 0
        pronunciation_score = min(90, 60 + (len(payload.conversation) * 2)) if user_messages else 0
        
        total_words_all = total_english_words + total_marathi_words
        english_percentage = int((total_english_words / (total_words_all or 1)) * 100)
        
        feedback_parts = []
        
        if user_messages:
            if fluency_score >= 80:
                feedback_parts.append("तुमची प्रगती खूप चांगली आहे! आत्मविश्वासाने बोलत राहा.")
            elif fluency_score >= 60:
                feedback_parts.append("चांगले प्रयत्न! थोडा अधिक सराव केल्यास तुमची वाक्यरचना सुधारेल.")
            else:
                feedback_parts.append("सुरुवात चांगली आहे! दररोज थोडे बोलण्याचा प्रयत्न करा.")
            
            if total_words > 0:
                feedback_parts.append(f"तुम्ही एकूण {total_words} शब्द बोललात.")
                
                if total_marathi_words > 0 and total_english_words > 0:
                    if english_percentage < 30:
                        feedback_parts.append(f"तुम्ही {100 - english_percentage}% मराठी शब्द वापरले. पुढील वेळी अधिक इंग्रजी शब्द वापरण्याचा प्रयत्न करा.")
                    elif english_percentage < 50:
                        feedback_parts.append(f"तुम्ही {english_percentage}% इंग्रजी शब्द वापरले. अधिक इंग्रजी बोलण्याचा प्रयत्न करा.")
                    else:
                        feedback_parts.append(f"तुम्ही {english_percentage}% इंग्रजी शब्द वापरले. छान प्रगती! असेच चालू ठेवा.")
                
                if avg_words_per_message < 5:
                    feedback_parts.append("प्रत्येक वाक्यात थोडे अधिक शब्द वापरा. उदा. 'I am fine' ऐवजी 'I am feeling very happy today' म्हणा.")
                elif avg_words_per_message < 10:
                    feedback_parts.append("चांगले! आता थोडी मोठी वाक्ये बोलण्याचा प्रयत्न करा.")
                else:
                    feedback_parts.append("उत्तम! तुम्ही मोठी वाक्ये बोलत आहात. ही चांगली प्रगती आहे!")
            
            if questions_asked > 0:
                feedback_parts.append(f"तुम्ही {questions_asked} प्रश्न विचारले - हे खूप चांगले आहे! संभाषण चालू ठेवण्यासाठी प्रश्न विचारणे महत्त्वाचे आहे.")
            else:
                feedback_parts.append("पुढील वेळी एक छोटासा प्रश्न विचारण्याचा प्रयत्न करा. जसे 'How are you?' किंवा 'What is this?'")
            
            feedback_mr = " ".join(feedback_parts)
        else:
            feedback_mr = "कोणतेही संभाषण आढळले नाही. कृपया पुढील सत्रात अधिक बोला."
        
        return {
            "fluencyScore": int(fluency_score),
            "confidenceScore": int(confidence_score),
            "pronunciationScore": int(pronunciation_score),
            "vocabularyScore": int(vocab_score),
            "grammarScore": int(grammar_score),
            "feedback_mr": feedback_mr,
            "totalMessages": len(user_messages) if user_messages else 0,
            "totalWords": total_words,
            "englishWords": total_english_words,
            "marathiWords": total_marathi_words,
            "englishPercentage": english_percentage,
            "averageWordsPerMessage": round(avg_words_per_message, 1) if user_messages else 0,
            "questionsAsked": questions_asked,
            "sessionLength": len(payload.conversation),
            "message": "Session completed successfully! Keep practicing!"
        }
        
    except Exception as e:
        logger.error(f"Error in session metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# TRANSCRIBE AUDIO ENDPOINT
# ==========================================
@api_router.post("/transcribe-audio")
async def transcribe_audio(payload: Dict[str, Any]):
    """
    Transcribes audio from base64 encoded audio data.
    Uses faster-whisper locally for fast, free transcription.
    """
    try:
        audio_data = payload.get("audio_data", "")
        language = payload.get("language", "en-US")
        
        if not audio_data:
            raise HTTPException(status_code=400, detail="No audio data provided")
        
        import base64
        audio_bytes = base64.b64decode(audio_data)
        
        transcribed_text = None
        
        if FASTER_WHISPER_AVAILABLE and local_whisper:
            try:
                transcribed_text = await transcribe_locally(audio_bytes)
                if transcribed_text and len(transcribed_text.strip()) > 0:
                    logger.info(f"✅ faster-whisper transcribed: '{transcribed_text}'")
            except Exception as e:
                logger.warning(f"⚠️ faster-whisper failed: {e}")
                transcribed_text = None
        
        if not transcribed_text or len(transcribed_text.strip()) == 0:
            try:
                import speech_recognition as sr
                import tempfile
                import os
                
                with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp_audio:
                    temp_audio.write(audio_bytes)
                    temp_path = temp_audio.name
                
                wav_path = temp_path.replace('.webm', '.wav')
                try:
                    from pydub import AudioSegment
                    audio_segment = AudioSegment.from_file(temp_path, format="webm")
                    audio_segment.export(wav_path, format="wav")
                except:
                    try:
                        import subprocess
                        subprocess.run(['ffmpeg', '-i', temp_path, wav_path], capture_output=True, check=True)
                    except:
                        wav_path = temp_path
                
                recognizer = sr.Recognizer()
                with sr.AudioFile(wav_path) as source:
                    recognizer.adjust_for_ambient_noise(source, duration=0.5)
                    audio_data_sr = recognizer.record(source)
                    
                    languages = ["en-US", "en-IN", "mr-IN", "hi-IN"]
                    for lang in languages:
                        try:
                            transcribed_text = recognizer.recognize_google(audio_data_sr, language=lang)
                            if transcribed_text and len(transcribed_text.strip()) > 0:
                                logger.info(f"✅ Google Speech ({lang}) transcribed: '{transcribed_text}'")
                                break
                        except:
                            continue
                
                try:
                    os.unlink(temp_path)
                    if os.path.exists(wav_path) and wav_path != temp_path:
                        os.unlink(wav_path)
                except:
                    pass
                    
            except Exception as e:
                logger.warning(f"⚠️ Google Speech failed: {e}")
                transcribed_text = None
        
        if not transcribed_text or len(transcribed_text.strip()) == 0:
            return {"transcript": "", "error": "Could not transcribe audio"}
        
        return {"transcript": transcribed_text.strip(), "success": True}
        
    except Exception as e:
        logger.error(f"Error in transcribe-audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# DYNAMIC WRITING CATEGORIES & FALLBACKS
# ==========================================
WRITING_CATEGORIES = [
    "Personal Experiences & Life Events",
    "Technology, AI & Future Trends",
    "Career, Business & Ambition",
    "Environment, Climate & Nature",
    "Culture, Travel & Food",
    "Social Issues & Current Debates",
    "Daily Habits & Personal Growth",
    "Education & Learning",
    "Health & Wellness",
    "Creativity & Art",
    "Leadership & Teamwork"
]

FALLBACK_WRITING_PROMPTS = [
    {
        "title_en": "Describe a memorable day in your life and why it was special.",
        "title_mr": "तुमच्या आयुष्यातील एक संस्मरणीय दिवस आणि तो का खास होता याचे वर्णन करा.",
        "hints": [
            "प्रस्तावना (Introduction): तो कोणता दिवस होता आणि तुम्ही कुठे होता?",
            "मुख्य घटना (Main Events): त्या दिवशी काय घडले ते सविस्तर सांगा.",
            "निष्कर्ष (Conclusion): तो दिवस तुमच्यासाठी का महत्त्वाचा होता?"
        ]
    },
    {
        "title_en": "How technology and AI are changing our daily routines.",
        "title_mr": "तंत्रज्ञान आणि AI आपल्या दैनंदिन जीवनात कसा बदल घडवून आणत आहेत.",
        "hints": [
            "प्रस्तावना (Introduction): आपण दररोज कोणती साधने वापरतो?",
            "फायदे आणि तोटे (Pros & Cons): या तंत्रज्ञानाचे परिणाम काय आहेत?",
            "निष्कर्ष (Conclusion): भविष्यात यात काय बदल होऊ शकतात?"
        ]
    },
    {
        "title_en": "Your dream career and the steps you are taking to achieve it.",
        "title_mr": "तुमचे स्वप्नातील क्षेत्र/नोकरी आणि ती मिळवण्यासाठी तुम्ही करत असलेले प्रयत्न.",
        "hints": [
            "प्रस्तावना (Introduction): तुमचे ध्येय काय आहे?",
            "कारण (Reason): तुम्हाला हेच क्षेत्र का आवडते?",
            "योजना (Plan): ते साध्य करण्यासाठी तुमची रणनीती काय आहे?"
        ]
    },
    {
        "title_en": "The importance of learning new languages in the modern world.",
        "title_mr": "आधुनिक जगात नवीन भाषा शिकण्याचे महत्त्व.",
        "hints": [
            "प्रस्तावना (Introduction): भाषा शिकणे का गरजेचे आहे?",
            "फायदे (Benefits): यामुळे करिअर आणि व्यक्तिमत्त्वात काय फायदा होतो?",
            "निष्कर्ष (Conclusion): इंग्रजी शिकताना येणारे अनुभव सांगा."
        ]
    }
]


# ==========================================
# UNIVERSAL DIALOGUE DATA FORMATTER
# ==========================================
def format_dialogue_item(item: dict) -> dict:
    """Normalizes dialogue keys into both camelCase and snake_case formats to match any frontend UI schema."""
    quote = item.get("quote") or item.get("dialogue") or item.get("expression") or ""
    movie = item.get("movie") or ""
    speaker = item.get("speaker") or ""
    context = item.get("context") or ""
    
    what_it_means = (
        item.get("what_it_means") or item.get("whatItMeans") or 
        item.get("what_to_express") or item.get("whatToExpress") or 
        item.get("meaning") or context
    )
    
    when_to_use = item.get("when_to_use") or item.get("whenToUse") or item.get("when") or ""
    where_to_use = item.get("where_to_use") or item.get("whereToUse") or item.get("where") or ""
    
    how_to_use = (
        item.get("how_to_use") or item.get("howToUse") or 
        item.get("usage") or item.get("example") or f'Say "{quote}" confidently.'
    )
    
    marathi = (
        item.get("marathi_explanation") or item.get("marathiExplanation") or 
        item.get("marathi_summary") or item.get("marathiSummary") or 
        item.get("marathi") or item.get("marathi_meaning") or "योग्य प्रसंगी वापरा."
    )

    return {
        "quote": quote,
        "dialogue": quote,
        "expression": quote,
        "movie": movie,
        "speaker": speaker,
        "context": context,
        
        # Meanings
        "what_it_means": what_it_means,
        "whatItMeans": what_it_means,
        "what_to_express": what_it_means,
        "meaning": what_it_means,
        
        # Usage Timing & Location
        "when_to_use": when_to_use,
        "whenToUse": when_to_use,
        "where_to_use": where_to_use,
        "whereToUse": where_to_use,
        "how_to_use": how_to_use,
        "howToUse": how_to_use,
        
        # Marathi Explanations
        "marathi_explanation": marathi,
        "marathiExplanation": marathi,
        "marathi": marathi,
        "marathi_meaning": marathi
    }


# ==========================================
# DYNAMIC THEMES FOR FRESH DIALOGUES
# ==========================================
DIALOGUE_THEMES = [
    "Sci-Fi & Cyberpunk classics",
    "Action & Superhero thrillers",
    "Comedies & Lighthearted humor",
    "Inspiring Drama & Motivational speeches",
    "Crime, Mystery & Heist movies",
    "Romantic Comedies & Relationship drama",
    "Adventure & Fantasy epics",
    "90s and 2000s iconic cinema",
    "Psychological Thrillers & Mind-bending movies",
    "Historical Epics & Period dramas",
    "Animated Movies & Family films",
    "Independent Cinema & Indie classics",
]


DEFAULT_HOLLYWOOD_DIALOGUES_RAW = [
    {
        "quote": "May the Force be with you.",
        "movie": "Star Wars (1977)",
        "speaker": "General Dodonna",
        "context": "Battle preparation briefing.",
        "where_to_use": "Before a friend or colleague starts a challenging task or exam.",
        "what_it_means": "Encouragement and wishing good luck.",
        "when_to_use": "Right as someone is leaving for an interview or competition.",
        "how_to_use": "Say it warmly with a smile to boost confidence.",
        "marathi_explanation": "कुणालाही महत्त्वाच्या कामासाठी किंवा परीक्षेसाठी जाताना शुभेच्छा देण्यासाठी हे वापरा."
    },
    {
        "quote": "I'm going to make him an offer he can't refuse.",
        "movie": "The Godfather (1972)",
        "speaker": "Vito Corleone",
        "context": "Assuring a favor for an ally.",
        "where_to_use": "In business negotiations or persuasive pitches.",
        "what_it_means": "Absolute confidence in presenting an irresistible proposal.",
        "when_to_use": "When you have a deal or offer that benefits both parties immensely.",
        "how_to_use": "Use in casual business chats to show confidence.",
        "marathi_explanation": "व्यवसाय वाटाघाटींमध्ये किंवा एखादा उत्तम प्रस्ताव ठेवताना आत्मविश्वास व्यक्त करण्यासाठी."
    },
    {
        "quote": "You can't handle the truth!",
        "movie": "A Few Good Men (1992)",
        "speaker": "Col. Nathan R. Jessep",
        "context": "Intense courtroom confrontation.",
        "where_to_use": "Playfully or seriously when someone avoids a harsh reality.",
        "what_it_means": "Standing firm on a difficult reality.",
        "when_to_use": "During intense debates or playful arguments with friends.",
        "how_to_use": "Deliver with strong emphasis during lighthearted debates.",
        "marathi_explanation": "जेव्हा कोणी कठीण सत्याचा सामना करण्यास टाळाटाळ करत असेल तेव्हा वापरा."
    },
    {
        "quote": "Keep your friends close, but your enemies closer.",
        "movie": "The Godfather Part II (1974)",
        "speaker": "Michael Corleone",
        "context": "Strategic rivalry advice.",
        "where_to_use": "In corporate politics or competitive environments.",
        "what_it_means": "Maintaining close awareness of competitors.",
        "when_to_use": "When dealing with rival colleagues or competing businesses.",
        "how_to_use": "Share as strategic advice during discussions.",
        "marathi_explanation": "स्पर्धक किंवा विरोधकांवर बारीक लक्ष ठेवण्याच्या संदर्भात."
    },
    {
        "quote": "To infinity and beyond!",
        "movie": "Toy Story (1995)",
        "speaker": "Buzz Lightyear",
        "context": "Launch declaration.",
        "where_to_use": "Starting an ambitious project or setting big goals.",
        "what_it_means": "Boundless enthusiasm and vision.",
        "when_to_use": "When launching a new startup, app, or major life goal.",
        "how_to_use": "Exclaim enthusiastically when launching a new team project.",
        "marathi_explanation": "मोठी स्वप्ने पाहताना आणि नवीन प्रकल्पाची सुरुवात करताना उत्साहाने म्हणा."
    },
    {
        "quote": "Houston, we have a problem.",
        "movie": "Apollo 13 (1995)",
        "speaker": "Jim Lovell",
        "context": "Notifying mission control of failure.",
        "where_to_use": "In meetings or group chats when an unexpected bug or issue arises.",
        "what_it_means": "Calm notification of a critical issue.",
        "when_to_use": "Immediately after discovering a major technical glitch or roadblock.",
        "how_to_use": "Type into Slack or say in a meeting to announce a bug calmly.",
        "marathi_explanation": "एखादी मोठी अडचण किंवा तांत्रिक समस्या अचानक समोर आल्यावर शांतपणे सांगण्यासाठी."
    },
    {
        "quote": "There's no place like home.",
        "movie": "The Wizard of Oz (1939)",
        "speaker": "Dorothy Gale",
        "context": "Realization upon returning home.",
        "where_to_use": "After a long tiring trip or busy workday.",
        "what_it_means": "Comfort and relief of returning to familiar surroundings.",
        "when_to_use": "When you finally walk through your front door after a hectic week.",
        "how_to_use": "Say with a sigh of relief upon arriving home.",
        "marathi_explanation": "खूप प्रवास किंवा धावपळीनंतर घरी परतल्यावर मिळणाऱ्या आरामाच्या वेळी."
    },
    {
        "quote": "I'll be back.",
        "movie": "The Terminator (1984)",
        "speaker": "The Terminator",
        "context": "Leaving the police precinct desk.",
        "where_to_use": "When stepping away briefly from a meeting or desk.",
        "what_it_means": "Confident temporary departure.",
        "when_to_use": "When taking a short break before returning to finish a task.",
        "how_to_use": "Say in a deep voice when leaving a room temporarily.",
        "marathi_explanation": "काही मिनिटांसाठी बाहेर जाऊन परत येताना मजेशीर अंदाजात सांगण्यासाठी."
    },
    {
        "quote": "Carpe diem. Seize the day, boys.",
        "movie": "Dead Poets Society (1989)",
        "speaker": "John Keating",
        "context": "Inspiring students in class.",
        "where_to_use": "Motivating team members or friends to take action now.",
        "what_it_means": "Seizing the present moment without delay.",
        "when_to_use": "When encouraging someone to start working on their dreams today.",
        "how_to_use": "Use as a morning motivational message or rally call.",
        "marathi_explanation": "वेळेचा सदुपयोग करून आजच कामाला लागण्यासाठी प्रेरित करताना."
    },
    {
        "quote": "Why so serious?",
        "movie": "The Dark Knight (2008)",
        "speaker": "The Joker",
        "context": "Confrontation scene in the penthouse.",
        "where_to_use": "Lightening the mood when someone is overstressed.",
        "what_it_means": "Encouraging relaxation and humor.",
        "when_to_use": "When a colleague or friend is worrying too much over small things.",
        "how_to_use": "Say playfully to break tension in a stressed environment.",
        "marathi_explanation": "एखादा खूप ताणतणावात किंवा गंभीर असताना त्याला हसवण्यासाठी किंवा शांत करण्यासाठी."
    }
]

DEFAULT_HOLLYWOOD_DIALOGUES = [format_dialogue_item(d) for d in DEFAULT_HOLLYWOOD_DIALOGUES_RAW]


# ==========================================
# 4 DOMAINS SYSTEM PROMPTS & PROGRESSION
# ==========================================
DOMAIN_SYSTEM_PROMPTS = {
    "Finance & Wealth": """
You are a senior financial educator training retail investors and professionals. 
Writing chapter {chapter_number} of a progressive finance course.
Progression: Tier 1 (Ch 1-3) Money mechanics; Tier 2 (Ch 4-7) Growing money; Tier 3 (Ch 8-11) Professional wealth; Tier 4 (Ch 12+) Job-ready finance.
Concepts already covered by this user (DO NOT REPEAT THESE): {concepts_already_covered}
""",
    "Video Editing & AI Tools": """
You are a working video editor and AI-tools specialist. 
Writing chapter {chapter_number} of a course to make someone employable as an editor.
Progression: Tier 1 (Ch 1-3) Fundamentals & Cuts; Tier 2 (Ch 4-7) Color & Sound craft; Tier 3 (Ch 8-11) AI-accelerated workflow; Tier 4 (Ch 12+) Getting paid.
Concepts already covered by this user (DO NOT REPEAT THESE): {concepts_already_covered}
""",
    "Sales & Deal Closing": """
You are a top enterprise sales rep turned sales trainer. 
Writing chapter {chapter_number} of a course for closing deals or landing sales roles.
Progression: Tier 1 (Ch 1-3) Foundations & Discovery; Tier 2 (Ch 4-7) Persuasion & Objections; Tier 3 (Ch 8-11) Negotiation; Tier 4 (Ch 12+) Closing & Career.
Concepts already covered by this user (DO NOT REPEAT THESE): {concepts_already_covered}
""",
    "Hollywood Dialogues & Expressions": """
You are a working screenwriter and script consultant. 
Writing chapter {chapter_number} of a course teaching professional dialogue writing and cinematic expressions.
Progression: Tier 1 (Ch 1-3) Subtext & Voice; Tier 2 (Ch 4-7) Conflict & Rhythm; Tier 3 (Ch 8-11) Scene Dynamics; Tier 4 (Ch 12+) Industry Formats.
Concepts already covered by this user (DO NOT REPEAT THESE): {concepts_already_covered}
"""
}

DOMAIN_ALIASES = {
    "finance": "Finance & Wealth",
    "finance & wealth": "Finance & Wealth",
    "video editing": "Video Editing & AI Tools",
    "video editing & ai tools": "Video Editing & AI Tools",
    "sales": "Sales & Deal Closing",
    "sales & deal closing": "Sales & Deal Closing",
    "hollywood": "Hollywood Dialogues & Expressions",
    "hollywood dialogues & expressions": "Hollywood Dialogues & Expressions",
}

UNIVERSAL_CHAPTER_RULES = """
Universal Rules:
- Output must be exactly ONE comprehensive reading page (380-450 words). No filler.
- Include Marathi explanations for key concepts within the text or as a dedicated breakdown.
- Return JSON strictly with this schema:
{
  "chapter_title": "Chapter {chapter_number}: [Title]",
  "page_content": "Paragraph 1: ...\\n\\nParagraph 2: ...\\n\\nParagraph 3: ...",
  "marathi_summary": "सविस्तर मराठी स्पष्टीकरण आणि महत्त्वाचे मुद्दे...",
  "key_takeaway": "1 sentence core takeaway.",
  "action_item": "1 concrete task.",
  "new_concepts": ["concept 1", "concept 2"]
}
Return raw JSON only without markdown.
"""


# ==========================================
# ENHANCED HELPER LOGIC FOR HOLLYWOOD DIALOGUES
# ==========================================
async def generate_dialogues_list(
    req_page: int = 1, 
    force_fresh: bool = True
) -> List[Dict[str, Any]]:
    """Generates 10 dynamic, unique Hollywood dialogues cascading across LLM providers."""
    selected_theme = random.choice(DIALOGUE_THEMES)
    random_seed = int(time.time() * 1000) % 10000

    system_prompt = "You are an expert Hollywood screenwriter and film analyst creating educational dialogues."
    user_prompt = f"""
Generate exactly 10 unique, famous, and conversational Hollywood movie dialogues.
Theme/Genre Focus: {selected_theme} (Batch Set #{req_page}, Seed: {random_seed}).

CRITICAL INSTRUCTIONS:
- Do NOT repeat standard clichés like "May the Force be with you" or "I'll be back" unless necessary. Choose fresh, expressive movie quotes.
- Provide practical explanations for daily life English learners.

Return JSON strictly with key 'dialogues' containing an array of exactly 10 objects with keys:
- "quote"
- "movie"
- "speaker"
- "context"
- "what_it_means"
- "where_to_use"
- "when_to_use"
- "how_to_use"
- "marathi_explanation"
"""

    try:
        logger.info(f"⚡ Requesting dialogues cascade (Page: {req_page}, Theme: {selected_theme})...")
        data = await call_llm_with_fallback(system_prompt, user_prompt, temperature=0.9)
        if isinstance(data, dict) and "dialogues" in data and isinstance(data["dialogues"], list) and len(data["dialogues"]) > 0:
            logger.info("✅ Fallback dialogues generated successfully!")
            return [format_dialogue_item(d) for d in data["dialogues"]]
    except Exception as err:
        logger.error(f"❌ All LLM providers failed for dialogues: {err}")

    logger.warning("⚠️ Serving fallback static dialogues.")
    shuffled_defaults = DEFAULT_HOLLYWOOD_DIALOGUES.copy()
    random.shuffle(shuffled_defaults)
    return shuffled_defaults


# ==========================================
# CORE CHAPTER GENERATION LOGIC
# ==========================================
async def process_chapter_generation(user_id: str, raw_domain: str, chapter_number: int):
    matched_domain = DOMAIN_ALIASES.get(raw_domain.strip().lower(), "Finance & Wealth")
    if matched_domain == "Finance & Wealth" and raw_domain.strip().lower() not in DOMAIN_ALIASES:
        for key in DOMAIN_SYSTEM_PROMPTS.keys():
            if raw_domain.strip().lower() in key.lower() or key.lower() in raw_domain.strip().lower():
                matched_domain = key
                break

    progress_doc = await db.user_progress.find_one({"user_id": user_id, "domain": matched_domain})
    concepts_already_covered = progress_doc.get("concepts_already_covered", []) if progress_doc else []

    cached_chapter = await db.cached_chapters.find_one({
        "user_id": user_id,
        "domain": matched_domain,
        "chapter_number": chapter_number
    })

    if cached_chapter:
        cached_chapter.pop("_id", None)
        if matched_domain == "Hollywood Dialogues & Expressions":
            raw_dialogues = cached_chapter.get("dialogues")
            if not raw_dialogues or not isinstance(raw_dialogues, list):
                cached_chapter["dialogues"] = await generate_dialogues_list(
                    req_page=chapter_number, 
                    force_fresh=True
                )
            else:
                cached_chapter["dialogues"] = [format_dialogue_item(d) for d in raw_dialogues]
        return cached_chapter

    domain_default_titles = {
        "Finance & Wealth": f"Chapter {chapter_number}: Capital Allocation & Cash Flow Mechanics",
        "Video Editing & AI Tools": f"Chapter {chapter_number}: Timeline Assembly & Automated Cut Workflows",
        "Sales & Deal Closing": f"Chapter {chapter_number}: Discovery Frameworks & Objection Handling",
        "Hollywood Dialogues & Expressions": f"Chapter {chapter_number}: Subtext Engineering & Cinematic Rhythm"
    }

    domain_prompt_template = DOMAIN_SYSTEM_PROMPTS[matched_domain]
    system_prompt = domain_prompt_template.format(
        chapter_number=chapter_number,
        concepts_already_covered=json.dumps(concepts_already_covered)
    )

    user_prompt = UNIVERSAL_CHAPTER_RULES.format(chapter_number=chapter_number)

    generated_data = {}
    try:
        generated_data = await call_llm_with_fallback(system_prompt, user_prompt, temperature=0.7)
    except Exception as err:
        logger.warning(f"All LLM providers failed chapter generation: {err}")

    if not generated_data or "page_content" not in generated_data:
        generated_data = {
            "chapter_title": domain_default_titles.get(matched_domain, f"Chapter {chapter_number}: Advanced {matched_domain}"),
            "page_content": (
                f"Paragraph 1: Building upon prior milestones in {matched_domain}, Chapter {chapter_number} "
                "introduces critical concepts and practical applications designed for mastery.\n\n"
                "Paragraph 2: Understanding these core mechanics enables scalable execution and deeper insight into the domain.\n\n"
                "Paragraph 3: Apply these principles directly to real-world scenarios to solidify your skills."
            ),
            "marathi_summary": f"या अध्यायात आपण {matched_domain} मधील महत्त्वाच्या संकल्पना आणि त्यांचे व्यावहारिक उपयोग शिकलो.",
            "key_takeaway": f"Master the core principles of {matched_domain}.",
            "action_item": "Practice applying these principles to a real-world scenario today.",
            "new_concepts": ["Core Mechanics", "Practical Application"]
        }

    # Save to MongoDB cached chapters
    doc_to_save = {
        "user_id": user_id,
        "domain": matched_domain,
        "chapter_number": chapter_number,
        **generated_data
    }
    await db.cached_chapters.update_one(
        {"user_id": user_id, "domain": matched_domain, "chapter_number": chapter_number},
        {"$set": doc_to_save},
        upsert=True
    )
    return generated_data


# ==========================================
# PROGRESS TRACKING ENDPOINT
# ==========================================
@api_router.post("/progress/complete")
async def complete_progress(
    payload: Optional[ProgressUpdateRequest] = None,
    skill: Optional[str] = Query(None),
    xp: Optional[int] = Query(None),
    words: Optional[int] = Query(0),
    user_id: Optional[str] = Query(None),
):
    target_skill = payload.skill if payload else skill
    target_xp = payload.xp if payload else (xp or 0)
    target_user_id = payload.user_id if payload else user_id

    if not target_skill:
        raise HTTPException(status_code=400, detail="Skill parameter is required")

    try:
        if not target_user_id:
            users = await db.users.find({}).to_list(1)
            if users:
                target_user_id = users[0]["id"]
            else:
                raise HTTPException(status_code=404, detail="No user found")

        user = await db.users.find_one({"id": target_user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        new_xp = user.get("xp", 0) + target_xp
        new_level = user.get("level", 1)
        if new_xp >= new_level * 150:
            new_level += 1

        skills = user.get("skills", {})
        if target_skill in skills:
            skills[target_skill] = min(100, skills.get(target_skill, 0) + 5)

        await db.users.update_one(
            {"id": target_user_id},
            {
                "$set": {
                    "xp": new_xp,
                    "level": new_level,
                    "skills": skills,
                    "streak": user.get("streak", 0) + 1,
                    "last_active": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

        updated = await db.users.find_one({"id": target_user_id})
        updated.pop("_id", None)
        return {"user": updated, "new_badges": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# HOLLYWOOD DIALOGUES ENDPOINTS
# ==========================================
@api_router.get("/hollywood-dialogues")
async def fetch_hollywood_dialogues_get(page: int = Query(1)):
    """Fetch Hollywood dialogues - always generates fresh dialogues on request."""
    dialogues = await generate_dialogues_list(req_page=page, force_fresh=True)
    return {"dialogues": dialogues}


@api_router.post("/hollywood-dialogues")
async def fetch_hollywood_dialogues_post(payload: Optional[DialoguesRequest] = None):
    """Fetch Hollywood dialogues with optional page parameter - always fresh."""
    req_page = payload.page if payload and payload.page else random.randint(1, 100)
    dialogues = await generate_dialogues_list(req_page=req_page, force_fresh=True)
    return {"dialogues": dialogues}


# ==========================================
# READING & PRONUNCIATION BOT API
# ==========================================
@api_router.post("/reading/pronunciation-bot")
async def pronunciation_bot(payload: PronunciationBotRequest):
    sentence = payload.sentence.strip()
    if not sentence:
        raise HTTPException(status_code=400, detail="Sentence cannot be empty")

    system_prompt = f"""
Analyze the sentence: "{sentence}"
Provide word-by-word pronunciation breakdowns, phonetic spellings, stress points, audio pacing/pause markers, and Marathi explanation tips for learners.
Return JSON strictly with schema:
{{
  "sentence": "{sentence}",
  "word_breakdowns": [
    {{
      "word": "Word",
      "phonetic": "PHONETIC",
      "stress": "Stress detail",
      "pause_recommended": "Short pause / None",
      "tip": "Marathi pronunciation tip"
    }}
  ],
  "pacing_tip": "Overall pacing and audio guide tip in English & Marathi."
}}
Return raw JSON only without markdown.
"""

    user_prompt = f"Analyze the sentence: {sentence}"

    try:
        return await call_llm_with_fallback(system_prompt, user_prompt, temperature=0.3)
    except Exception as err:
        logger.warning(f"Pronunciation bot failed: {err}")
        words = sentence.split()
        breakdowns = [{
            "word": w,
            "phonetic": f"{w.lower()}-phonetic",
            "stress": "Standard stress",
            "pause_recommended": "Short pause",
            "tip": f"उच्चार स्पष्ट करा: {w}"
        } for w in words]
        return {
            "sentence": sentence,
            "word_breakdowns": breakdowns,
            "pacing_tip": "वाचताना प्रत्येक शब्दावर लक्ष ठेवा आणि स्वल्पविरामाजवळ (comma) थोडा थंबा."
        }


# ==========================================
# TTS SPEECH MARKS API
# ==========================================
@api_router.post("/reading/tts-marks")
async def generate_tts_speech_marks(payload: TTSMarksRequest):
    page_text = payload.page_text or ""
    words = page_text.split()
    
    timing_marks = []
    current_time_ms = 0
    current_char_offset = 0

    for word in words:
        start_char = page_text.find(word, current_char_offset)
        end_char = start_char + len(word)
        current_char_offset = end_char
        duration_ms = max(200, len(word) * 60)
        
        timing_marks.append({
            "word": word,
            "start_char": start_char,
            "end_char": end_char,
            "time_ms": current_time_ms
        })
        current_time_ms += duration_ms

    return {
        "total_duration_ms": current_time_ms,
        "timing_marks": timing_marks
    }


# ==========================================
# TRANSLATION & VOCABULARY ENDPOINTS
# ==========================================
@api_router.post("/translate-word")
async def translate_word(payload: WordTranslationRequest):
    clean_word = payload.word.strip().lower()

    system_prompt = f"Translate and explain the contextual meaning of '{clean_word}' into Marathi and Hindi. Return JSON strictly with keys: 'mr', 'hi'. Return raw JSON only without markdown."
    user_prompt = f"Translate '{clean_word}' into Marathi and Hindi."

    try:
        return await call_llm_with_fallback(system_prompt, user_prompt, temperature=0.3)
    except Exception as err:
        logger.warning(f"Translation failed: {err}")
        return {
            "mr": f"{clean_word} (संदर्भानुसार मूळ मराठी अर्थ)",
            "hi": f"{clean_word} (संदर्भ आधारित हिंदी अर्थ)",
        }


# ==========================================
# ROOT ENDPOINT
# ==========================================
@app.get("/")
async def root():
    return {"message": "Shaabdh Saathi Progressive Learning API is operational.", "status": "healthy"}


# ==========================================
# EDGE TTS ENDPOINT
# ==========================================
@app.get("/api/tts")
async def generate_speech(
    text: str = Query(...),
    language: str = Query("auto")
):
    """
    Generates speech audio using Microsoft Edge's free neural voice.
    - language=en -> English voice (en-US-JennyNeural)
    - language=mr -> Marathi voice (mr-IN-AarohiNeural)
    - language=hi -> Hindi voice (hi-IN-SwaraNeural)
    - language=auto -> Auto-detect based on text content
    """
    try:
        import edge_tts
        import re
        
        voices = {
            "en": "en-US-JennyNeural",
            "en-us": "en-US-JennyNeural",
            "en-gb": "en-GB-SoniaNeural",
            "mr": "mr-IN-AarohiNeural",
            "hi": "hi-IN-SwaraNeural"
        }
        
        if language in voices:
            voice = voices[language]
            logger.info(f"🔊 Using {language} voice: {voice}")
        else:
            devanagari_pattern = re.compile(r'[\u0900-\u097F]')
            has_devanagari = bool(devanagari_pattern.search(text))
            latin_pattern = re.compile(r'[a-zA-Z]')
            has_latin = bool(latin_pattern.search(text))
            
            if has_devanagari and not has_latin:
                voice = "mr-IN-AarohiNeural"
                logger.info(f"🔊 Using Marathi voice for Devanagari text")
            elif has_latin and not has_devanagari:
                voice = "en-US-JennyNeural"
                logger.info(f"🔊 Using American English voice for Latin text")
            else:
                english_words = len(re.findall(r'\b[a-zA-Z]{2,}\b', text))
                marathi_words = len(re.findall(r'[\u0900-\u097F]+', text))
                
                if marathi_words > english_words:
                    voice = "mr-IN-AarohiNeural"
                    logger.info(f"🔊 Using Marathi voice (more Marathi words)")
                elif english_words > marathi_words:
                    voice = "en-US-JennyNeural"
                    logger.info(f"🔊 Using American English voice (more English words)")
                else:
                    voice = "en-US-JennyNeural"
                    logger.info(f"🔊 Using American English voice (mixed, default)")
        
        communicator = edge_tts.Communicate(text, voice=voice)
        audio_bytes = b""
        
        async for chunk in communicator.stream():
            if chunk["type"] == "audio":
                audio_bytes += chunk["data"]

        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        logger.error(f"❌ Error in TTS generation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Include the API Router
app.include_router(api_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
