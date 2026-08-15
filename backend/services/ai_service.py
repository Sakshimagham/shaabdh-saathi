# app/services/ai_service.py
import os
import json
from typing import List, Dict
from groq import Groq

class AIService:
    def __init__(self):
        # Initialize Groq client
        self.client = Groq(
            api_key=os.environ.get("GROQ_API_KEY")
        )
        self.model = "llama-3.3-70b-versatile"  # Free, fast, and powerful!
    
    def generate_reading_passage(self, theme: str, level: int) -> Dict:
        """Generate a bilingual reading passage with glossary"""
        
        prompt = f"""
        Create a {theme} reading passage for a B.Com student at level {level}.
        
        Requirements:
        1. Write in simple English (for intermediate learners)
        2. Provide Marathi translation of the title and key terms
        3. Include a glossary of 5-8 key business/technical terms
        4. Each glossary term should have: word, English meaning, Marathi meaning, example sentence
        
        Return ONLY valid JSON in this format (no markdown, no extra text):
        {{
            "title": "English title",
            "title_mr": "Marathi title", 
            "text": "English passage text",
            "glossary": [
                {{"word": "term", "en": "English meaning", "mr": "Marathi meaning", "example": "sentence"}}
            ]
        }}
        """
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that generates bilingual educational content. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=1024
            )
            
            # Parse the response
            content = response.choices[0].message.content
            # Clean up if there are markdown code blocks
            content = content.replace("```json", "").replace("```", "").strip()
            return json.loads(content)
            
        except Exception as e:
            print(f"Error generating passage: {e}")
            # Return a fallback passage
            return self._get_fallback_passage(theme)
    
    def generate_writing_prompt(self, theme: str) -> Dict:
        """Generate a writing prompt with Marathi translation"""
        
        prompt = f"""
        Create a business writing prompt for a B.Com student on theme: {theme}.
        
        Provide:
        - English prompt (professional scenario)
        - Marathi translation
        - Clear instructions on what to write
        
        Return ONLY valid JSON:
        {{
            "prompt": "English prompt",
            "prompt_mr": "Marathi prompt"
        }}
        """
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant. Respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=512
            )
            
            content = response.choices[0].message.content
            content = content.replace("```json", "").replace("```", "").strip()
            return json.loads(content)
            
        except Exception as e:
            print(f"Error generating prompt: {e}")
            return {
                "prompt": f"Write about {theme} in business context",
                "prompt_mr": f"{theme} बद्दल व्यवसायिक संदर्भात लिहा"
            }
    
    def review_writing(self, prompt: str, text: str) -> Dict:
        """Review student's writing and provide feedback"""
        
        review_prompt = f"""
        Review this B.Com student's writing for the prompt: "{prompt}"
        
        Student's text:
        {text}
        
        Provide feedback in this JSON format:
        {{
            "score": 0-100,
            "went_well": "What they did well (English)",
            "went_well_mr": "What they did well (Marathi)",
            "improve": "What to improve (English)",
            "improve_mr": "What to improve (Marathi)",
            "tip": "One actionable tip (English)",
            "tip_mr": "One actionable tip (Marathi)",
            "corrected": "Corrected version of their text",
            "mistakes": [
                {{"wrong": "incorrect phrase", "right": "correct phrase", "why_mr": "Marathi explanation"}}
            ]
        }}
        """
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a helpful writing tutor. Respond with valid JSON only."},
                    {"role": "user", "content": review_prompt}
                ],
                temperature=0.5,
                max_tokens=1024
            )
            
            content = response.choices[0].message.content
            content = content.replace("```json", "").replace("```", "").strip()
            return json.loads(content)
            
        except Exception as e:
            print(f"Error reviewing writing: {e}")
            return {
                "score": 70,
                "went_well": "Good effort",
                "went_well_mr": "चांगला प्रयत्न",
                "improve": "Try to be more specific",
                "improve_mr": "अधिक तपशीलवार लिहा",
                "tip": "Practice writing daily",
                "tip_mr": "दररोज लिहिण्याचा सराव करा",
                "corrected": text,
                "mistakes": []
            }
    
    def _get_fallback_passage(self, theme: str) -> Dict:
        """Return a fallback passage if API fails"""
        return {
            "title": f"Introduction to {theme}",
            "title_mr": f"{theme} ची ओळख",
            "text": f"This is a sample passage about {theme}. Business is about creating value.",
            "glossary": [
                {"word": "Business", "en": "Commercial activity", "mr": "व्यवसाय", "example": "He runs a business"},
                {"word": "Value", "en": "Worth or importance", "mr": "मूल्य", "example": "Creating value for customers"}
            ]
        }