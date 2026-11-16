from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field

from backend.app.db.database import get_db
from backend.app.schemas.schemas import StandardizedLocation, LocationSource
from backend.app.services.geocoding_service import geocoding_service

router = APIRouter(prefix="/location", tags=["Location & Geocoding"])

class ReverseGeocodeRequest(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    source: LocationSource = LocationSource.GPS

class GeocodeRequest(BaseModel):
    address: str

@router.get("/autocomplete", response_model=List[StandardizedLocation])
def autocomplete_places(
    q: str = Query(..., min_length=1, description="Search query: address, landmark, shop, mall, station, street"),
    lat: Optional[float] = Query(None, description="Current viewport center latitude for proximity bias"),
    lon: Optional[float] = Query(None, description="Current viewport center longitude for proximity bias"),
    country: str = Query("in", description="Country code filter (defaults to India)"),
    db: Session = Depends(get_db)
):
    """
    Real-time dynamic place suggestions as user types.
    Supports full addresses, landmarks, shops, malls, metro stations, airports in English and Hindi.
    """
    try:
        return geocoding_service.autocomplete_search(
            query=q,
            lat=lat,
            lon=lon,
            country=country,
            db=db
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Location autocomplete error: {str(e)}")

@router.post("/reverse-geocode", response_model=StandardizedLocation)
def reverse_geocode_coordinates(
    payload: ReverseGeocodeRequest,
    db: Session = Depends(get_db)
):
    """
    Reverse geocodes geographic coordinates (lat, lon) into a clean, human-readable address.
    Used for browser GPS detection and interactive map pin dragging.
    """
    try:
        return geocoding_service.reverse_geocode(
            lat=payload.latitude,
            lon=payload.longitude,
            db=db,
            source=payload.source
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reverse geocoding error: {str(e)}")
