from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.db.database import get_db
from backend.app.schemas.schemas import SearchRequest, SearchResponse
from backend.app.services.routing_service import routing_service

router = APIRouter(prefix="/routes", tags=["Routes"])

@router.post("/search", response_model=SearchResponse)
def search_routes(request: SearchRequest, db: Session = Depends(get_db)):
    """
    Computes multimodal journey candidates combining Metro, DTC Bus, Auto,
    Cab, Bike-Taxi, and Walking, ranked by the user's priority weights.
    """
    try:
        return routing_service.search_multimodal_routes(db, request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Routing calculation error: {str(e)}")

@router.get("/popular-corridors")
def get_popular_delhi_corridors():
    """Returns curated popular corridors across Delhi NCR for quick 1-click searches."""
    return [
        {
            "id": "cp_to_cyberhub",
            "title": "Connaught Place → DLF Cyber City Gurugram",
            "origin": {"name": "Connaught Place (Rajiv Chowk)", "lat": 28.6328, "lon": 77.2197},
            "dest": {"name": "DLF Cyber City, Phase 2 Gurugram", "lat": 28.4967, "lon": 77.0903},
            "description": "High-traffic office corridor. Metro Yellow Line + Rapid Metro saves ~₹380 over direct cab."
        },
        {
            "id": "noida_to_aiims",
            "title": "Noida Sector 18 → AIIMS Delhi",
            "origin": {"name": "Noida Sector 18 (Atta Market)", "lat": 28.5708, "lon": 77.3261},
            "dest": {"name": "AIIMS New Delhi", "lat": 28.5683, "lon": 77.2078},
            "description": "Interstate hospital/commute corridor. Botanical Garden interchange saves 45 mins in peak traffic."
        },
        {
            "id": "dwarka_to_cp",
            "title": "Dwarka Sector 21 → Connaught Place",
            "origin": {"name": "Dwarka Sector 21", "lat": 28.5522, "lon": 77.0583},
            "dest": {"name": "Connaught Place", "lat": 28.6328, "lon": 77.2197},
            "description": "Airport Express Line vs Blue Line comparison with last-mile connectivity."
        },
        {
            "id": "lajpat_to_aerocity",
            "title": "Lajpat Nagar → Delhi Aerocity",
            "origin": {"name": "Lajpat Nagar Central Market", "lat": 28.5703, "lon": 77.2372},
            "dest": {"name": "Delhi Aerocity Hospitality District", "lat": 28.5489, "lon": 77.1219},
            "description": "Pink Line to Dhaula Kuan transfer to Airport Express."
        }
    ]
