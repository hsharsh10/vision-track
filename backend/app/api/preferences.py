from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.db.database import get_db
from backend.app.models.models import UserPreference
from backend.app.schemas.schemas import UserPreferenceUpdate

router = APIRouter(prefix="/preferences", tags=["Preferences"])

@router.get("")
def get_user_preferences(user_id: str = "default_user", db: Session = Depends(get_db)):
    """Retrieves saved user mobility preferences."""
    pref = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    if not pref:
        pref = UserPreference(user_id=user_id)
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref

@router.post("")
def update_user_preferences(update_data: UserPreferenceUpdate, user_id: str = "default_user", db: Session = Depends(get_db)):
    """Saves updated user mobility constraints and preferences."""
    pref = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    if not pref:
        pref = UserPreference(user_id=user_id)
        db.add(pref)

    for field, value in update_data.model_dump(exclude_unset=True).items():
        setattr(pref, field, value)

    db.commit()
    db.refresh(pref)
    return pref
