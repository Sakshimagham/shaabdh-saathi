"""
Test file for the /groq-talk-bot endpoint
Run this to test the endpoint without affecting your main server
"""

import asyncio
import json
import logging
from typing import List, Optional
from pydantic import BaseModel

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ==========================================
# PYDANTIC MODELS (Copy from your server)
# ==========================================
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


# ==========================================
# MOCK LLM CALL (Simulates the API)
# ==========================================
async def mock_call_llm_with_fallback(system_prompt: str, user_prompt: str, temperature: float = 0.7) -> dict:
    """Mock LLM call for testing"""
    logger.info(f"📤 Mock LLM called with temperature: {temperature}")
    logger.info(f"📝 System prompt: {system_prompt[:100]}...")
    logger.info(f"📝 User prompt: {user_prompt[:100]}...")
    
    # Return a mock response
    return {
        "reply": "That's interesting! Can you tell me more about your day?",
        "feedback_mr": "तुमचं इंग्रजी सुधारत आहे, माझ्यासोबत प्रॅक्टिस करा!",
        "soft_skill_tip": "Try to use more English words in your sentences."
    }


# ==========================================
# THE FIXED TALK BOT ENDPOINT (TEST VERSION)
# ==========================================
async def groq_talk_bot_test(payload: TalkBotRequest):
    """
    Test version of the talking bot endpoint
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
        
        day = payload.day if hasattr(payload, 'day') else 1
        
        logger.info(f"📊 User message count: {user_message_count}")
        logger.info(f"📊 Is initial: {is_initial}")
        logger.info(f"📊 Day: {day}")
        
        if is_initial:
            # ==========================================
            # FIRST MESSAGE - NO "सुधारलंय" !!!
            # ==========================================
            logger.info("🎯 FIRST MESSAGE - NO IMPROVEMENT WORDS")
            
            # FALLBACK TOPICS - NO IMPROVEMENT WORDS
            FALLBACK_TOPICS = [
                {
                    "topic": "Your Weekend Plans",
                    "question": "What are your plans for this weekend?",
                    "question_mr": "या आठवड्याच्या शेवटी तुमचे काय प्लॅन आहेत?",
                    "marathi_intro": "आपण आठवड्याच्या शेवटी काय करतो याबद्दल बोलूया!",
                    "follow_up": "Tell me about your favorite weekend activity.",
                    "fun_fact": "Weekends are a great time to relax and recharge!"
                },
                {
                    "topic": "Your Favorite Food",
                    "question": "What is your favorite food and why?",
                    "question_mr": "तुमची आवडती खाद्यपदार्थ कोणती आणि का?",
                    "marathi_intro": "चला, खाण्यापिण्याबद्दल गप्पा मारूया!",
                    "follow_up": "Do you like to cook or eat outside more?",
                    "fun_fact": "Food brings people together from all cultures!"
                },
                {
                    "topic": "Your Dream Destination",
                    "question": "If you could travel anywhere, where would you go?",
                    "question_mr": "जर तुम्ही कुठेही प्रवास करू शकलात तर कुठे जाल?",
                    "marathi_intro": "तुमच्या स्वप्नातील प्रवासाच्या ठिकाणाबद्दल सांगा!",
                    "follow_up": "What attracts you to that place?",
                    "fun_fact": "Traveling opens our minds to new cultures!"
                },
                {
                    "topic": "Your Daily Routine",
                    "question": "How does your typical day look like?",
                    "question_mr": "तुमचा एक सामान्य दिवस कसा जातो?",
                    "marathi_intro": "आपल्या दैनंदिन दिनचर्येबद्दल बोलूया!",
                    "follow_up": "What is your favorite time of the day?",
                    "fun_fact": "Routines help us stay organized and productive!"
                },
                {
                    "topic": "Your Hobbies",
                    "question": "What are your hobbies and interests?",
                    "question_mr": "तुमचे छंद आणि आवडी कोणत्या आहेत?",
                    "marathi_intro": "तुमच्या आवडीच्या गोष्टींबद्दल सांगा!",
                    "follow_up": "How did you develop interest in these hobbies?",
                    "fun_fact": "Hobbies make life more enjoyable and fulfilling!"
                },
                {
                    "topic": "Your Career Goals",
                    "question": "What are your career or life goals?",
                    "question_mr": "तुमची करिअर किंवा जीवनाची उद्दिष्टे काय आहेत?",
                    "marathi_intro": "तुमच्या ध्येयांबद्दल आणि स्वप्नांबद्दल बोलूया!",
                    "follow_up": "What steps are you taking to achieve them?",
                    "fun_fact": "Setting goals helps us stay focused and motivated!"
                }
            ]
            
            topic_index = (day - 1) % len(FALLBACK_TOPICS)
            topic_data = FALLBACK_TOPICS[topic_index].copy()
            
            # Create result with NO improvement words
            result = {
                "reply": f"Namaste! Day {day} - Let's talk about {topic_data.get('topic', 'Your Day')}! {topic_data.get('question', 'How are you?')}",
                "feedback_mr": f"तुम्ही इंग्रजी शिकायला सुरुवात केली आहे, खूप छान! {topic_data.get('marathi_intro', 'आजच्या विषयाबद्दल बोलूया!')}",
                "soft_skill_tip": "Start with simple words like 'Hello', 'How are you?'",
                "daily_topic": topic_data.get("topic", "Your Day"),
                "question": topic_data.get("question", "How are you?"),
                "question_mr": topic_data.get("question_mr", "आज तुम्हाला कसे वाटत आहे?"),
                "marathi_intro": topic_data.get("marathi_intro", "आजच्या विषयाबद्दल बोलूया!"),
                "fun_fact": topic_data.get("fun_fact", "Every day is a new opportunity to learn!"),
                "follow_up": topic_data.get("follow_up", "What else would you like to share?"),
                "_test_info": "FIRST MESSAGE - NO IMPROVEMENT WORDS"
            }
            
            # FINAL SAFETY CHECK - Remove any improvement words
            if "सुधारलंय" in result["feedback_mr"] or "सुधारत" in result["feedback_mr"]:
                logger.warning(f"⚠️ Improvement word detected in feedback_mr, replacing: {result['feedback_mr']}")
                result["feedback_mr"] = f"तुम्ही इंग्रजी शिकायला सुरुवात केली आहे, खूप छान! {topic_data.get('marathi_intro', 'आजच्या विषयाबद्दल बोलूया!')}"
            
            if "सुधारलंय" in result["reply"] or "सुधारत" in result["reply"]:
                logger.warning(f"⚠️ Improvement word detected in reply, replacing: {result['reply']}")
                result["reply"] = f"Namaste! Day {day} - Let's talk about {topic_data.get('topic', 'Your Day')}! {topic_data.get('question', 'How are you?')}"
            
            return result
            
        else:
            # ==========================================
            # NON-INITIAL MESSAGES - Can use improvement words
            # ==========================================
            logger.info("📝 NON-INITIAL MESSAGE - Can use improvement words")
            
            exchange_count = user_message_count
            
            if exchange_count <= 2:
                encouragement_msg = "तुम्ही इंग्रजी बोलायला सुरुवात केली आहे, ही खूप चांगली गोष्ट आहे! असेच चालू ठेवा."
            elif exchange_count <= 5:
                encouragement_msg = "तुम्ही चांगले इंग्रजी बोलत आहात! असेच सराव करा."
            else:
                encouragement_msg = "तुमचं इंग्रजी सुधारत आहे, माझ्यासोबत प्रॅक्टिस करा!"
            
            # Use mock LLM
            result = await mock_call_llm_with_fallback("", "", temperature=0.8)
            
            result["reply"] = result.get("reply", "That's interesting! Can you tell me more?")
            result["feedback_mr"] = result.get("feedback_mr", "तुमचं इंग्रजी सुधारत आहे, माझ्यासोबत प्रॅक्टिस करा!")
            result["soft_skill_tip"] = result.get("soft_skill_tip", "Try to use more English words.")
            result["_test_info"] = "NON-INITIAL MESSAGE - Can use improvement words"
            
            return result
        
    except Exception as e:
        logger.error(f"❌ Error in groq_talk_bot_test: {e}")
        return {
            "reply": "Hello! Welcome to your English practice session. How are you feeling today?",
            "feedback_mr": "तुम्ही इंग्रजी शिकायला सुरुवात केली आहे, खूप छान! आजचा दिवस कसा आहे?",
            "soft_skill_tip": "Start with simple words like 'Hello', 'How are you?'",
            "_test_info": "ERROR FALLBACK - NO IMPROVEMENT WORDS"
        }


# ==========================================
# TEST FUNCTIONS
# ==========================================
async def test_first_message():
    """Test the first message (should have NO improvement words)"""
    print("\n" + "="*60)
    print("🧪 TEST 1: FIRST MESSAGE (Should have NO 'सुधारलंय')")
    print("="*60)
    
    payload = TalkBotRequest(
        conversation=[],
        level=1,
        english_percent=50,
        is_initial_greeting=True,
        day=1
    )
    
    result = await groq_talk_bot_test(payload)
    print("\n📨 RESULT:")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    # Check for improvement words
    has_improvement = "सुधारलंय" in result.get("feedback_mr", "") or "सुधारत" in result.get("feedback_mr", "")
    if has_improvement:
        print("\n❌ FAILED: Found 'सुधारलंय' or 'सुधारत' in feedback_mr!")
    else:
        print("\n✅ PASSED: No improvement words found in feedback_mr!")
    
    return result


async def test_second_message():
    """Test a follow-up message (CAN have improvement words)"""
    print("\n" + "="*60)
    print("🧪 TEST 2: SECOND MESSAGE (Can have 'सुधारलंय')")
    print("="*60)
    
    payload = TalkBotRequest(
        conversation=[
            MessageModel(sender="user", text="I am fine thank you"),
        ],
        level=1,
        english_percent=50,
        is_initial_greeting=False,
        day=1
    )
    
    result = await groq_talk_bot_test(payload)
    print("\n📨 RESULT:")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    return result


async def test_multiple_messages():
    """Test with multiple messages (should have improvement words after 6+ exchanges)"""
    print("\n" + "="*60)
    print("🧪 TEST 3: MULTIPLE MESSAGES (Should have 'सुधारत आहे' after 6+ exchanges)")
    print("="*60)
    
    # Create 7 user messages (6+ exchanges)
    conversation = []
    for i in range(7):
        conversation.append(MessageModel(sender="user", text=f"Message {i+1}"))
        if i < 6:  # Add bot responses for all except last
            conversation.append(MessageModel(sender="bot", text=f"Bot response {i+1}"))
    
    payload = TalkBotRequest(
        conversation=conversation,
        level=1,
        english_percent=50,
        is_initial_greeting=False,
        day=1
    )
    
    result = await groq_talk_bot_test(payload)
    print("\n📨 RESULT:")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    # Check for improvement words (should have them now)
    has_improvement = "सुधारत" in result.get("feedback_mr", "")
    if has_improvement:
        print("\n✅ PASSED: Found 'सुधारत' in feedback_mr (expected after 6+ exchanges)!")
    else:
        print("\n⚠️ NOTE: No 'सुधारत' found (may still be early exchanges)")
    
    return result


async def run_all_tests():
    """Run all tests"""
    print("\n" + "="*60)
    print("🚀 STARTING TESTS FOR /groq-talk-bot ENDPOINT")
    print("="*60)
    
    # Test 1: First message
    await test_first_message()
    
    # Test 2: Second message
    await test_second_message()
    
    # Test 3: Multiple messages
    await test_multiple_messages()
    
    print("\n" + "="*60)
    print("✅ ALL TESTS COMPLETED")
    print("="*60)


# ==========================================
# RUN THE TESTS
# ==========================================
if __name__ == "__main__":
    asyncio.run(run_all_tests())