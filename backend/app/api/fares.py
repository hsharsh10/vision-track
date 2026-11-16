from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
from backend.app.db.database import get_db
from backend.app.schemas.schemas import FareEstimate
from backend.app.services.pricing_service import pricing_service
from backend.app.services.ml_service import ml_service
from backend.app.models.models import FareObservation

router = APIRouter(prefix="/fares", tags=["Fares"])

class FareEstimateRequest(BaseModel):
    provider_code: str
    category_code: str
    distance_km: float
    duration_min: float
    pickup_lat: float
    pickup_lon: float
    drop_lat: float
    drop_lon: float

class FareObservationSubmit(BaseModel):
    provider_code: str
    category_code: str
    pickup_lat: float
    pickup_lon: float
    drop_lat: float
    drop_lon: float
    distance_km: float
    duration_min: float
    quoted_fare: float
    surge_multiplier: float = 1.0

@router.post("/estimate", response_model=FareEstimate)
def estimate_fare(req: FareEstimateRequest, db: Session = Depends(get_db)):
    """Computes fare using 4-tier pricing hierarchy with calibrated confidence intervals."""
    return pricing_service.get_ride_fare_estimate(
        db=db,
        provider_code=req.provider_code,
        category_code=req.category_code,
        distance_km=req.distance_km,
        duration_min=req.duration_min,
        pickup_lat=req.pickup_lat,
        pickup_lon=req.pickup_lon,
        drop_lat=req.drop_lat,
        drop_lon=req.drop_lon
    )

@router.post("/observe")
def record_fare_observation(obs: FareObservationSubmit, db: Session = Depends(get_db)):
    """Saves user or authorized partner quoted fare observation into the calibration database."""
    now = datetime.utcnow()
    hour = now.hour
    day = now.weekday()
    record = FareObservation(
        provider_code=obs.provider_code,
        category_code=obs.category_code,
        pickup_lat=obs.pickup_lat,
        pickup_lon=obs.pickup_lon,
        drop_lat=obs.drop_lat,
        drop_lon=obs.drop_lon,
        distance_km=obs.distance_km,
        duration_min=obs.duration_min,
        quoted_fare=obs.quoted_fare,
        surge_multiplier=obs.surge_multiplier,
        hour_of_day=hour,
        day_of_week=day,
        is_weekend=(day >= 5),
        is_peak_hour=(8 <= hour <= 11) or (17 <= hour <= 21),
        source="OBSERVED",
        recorded_at=now
    )
    db.add(record)
    db.commit()
    return {"status": "success", "message": "Fare observation recorded for model calibration"}

@router.get("/models/metrics")
def get_ml_metrics():
    """Returns accuracy metrics (MAE, MdAE, E90) for all trained provider-vehicle models."""
    return ml_service.metrics
