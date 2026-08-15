from fastapi import APIRouter, HTTPException
from app.models.user import User
from app.services.db_service import db

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login")
async def login(name: str, contact: str):
    # Check if user exists
    existing = await db.users.find_one({"contact": contact})
    if existing:
        existing.pop("_id")
        return existing
    
    # Create new user
    new_user = User(name=name, contact=contact)
    user_dict = new_user.model_dump()
    user_dict["last_active"] = user_dict["last_active"].isoformat()
    
    await db.users.insert_one(user_dict)
    return new_user

@router.get("/me")
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.pop("_id")
    return user