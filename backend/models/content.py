from pydantic import BaseModel
from typing import List, Optional

class GlossaryItem(BaseModel):
    word: str
    en: str
    mr: str
    example: Optional[str] = None

class Passage(BaseModel):
    title: str
    title_mr: str
    text: str
    glossary: List[GlossaryItem] = []
    theme: str

class WritingPrompt(BaseModel):
    prompt: str
    prompt_mr: str
    theme: str

class ReviewResponse(BaseModel):
    score: int
    went_well: str
    went_well_mr: str
    improve: str
    improve_mr: str
    tip: str
    tip_mr: str
    corrected: str
    mistakes: List[dict] = []