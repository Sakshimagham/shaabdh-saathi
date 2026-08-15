from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    contact: str
    level: int = 1
    xp: int = 0
    streak: int = 0
    last_active: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    badges: List[str] = []
    skills: dict = {
        "reading": 0,
        "writing": 0,
        "speaking": 0,
        "listening": 0,
        "interview": 0
    }
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))