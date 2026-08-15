from fastapi import APIRouter, Query, Body
from app.services.ai_service import AIService
from app.models.content import WritingPrompt

router = APIRouter(prefix="/writing", tags=["writing"])
ai_service = AIService()

@router.get("/prompt")
async def get_writing_prompt(theme: str = Query(...)):
    """Get a writing prompt"""
    return ai_service.generate_writing_prompt(theme)

@router.post("/review")
async def review_writing(prompt: str = Body(...), text: str = Body(...)):
    """Review student's writing"""
    return ai_service.review_writing(prompt, text)