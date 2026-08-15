from fastapi import APIRouter, Query
from app.services.ai_service import AIService

router = APIRouter(prefix="/reading", tags=["reading"])
ai_service = AIService()

@router.get("/generate")
async def generate_reading(theme: str = Query(...), level: int = Query(1)):
    """Generate a reading passage with glossary"""
    return ai_service.generate_reading_passage(theme, level)