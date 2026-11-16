from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.db.database import get_db
from backend.app.models.models import TransitStation, BusStop, TransitFareRule, ProviderVehicleCategory

router = APIRouter(prefix="/transit", tags=["Transit"])

@router.get("/stations")
def list_stations(db: Session = Depends(get_db)):
    """Returns all Delhi NCR Metro stations with line associations, colors, and interchange flags."""
    stations = db.query(TransitStation).order_by(TransitStation.line_name, TransitStation.sequence_order).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "line_name": s.line_name,
            "line_color": s.line_color,
            "latitude": s.latitude,
            "longitude": s.longitude,
            "is_interchange": s.is_interchange,
            "interchange_lines": s.interchange_lines.split(",") if s.interchange_lines else []
        }
        for s in stations
    ]

@router.get("/bus-stops")
def list_bus_stops(db: Session = Depends(get_db)):
    """Returns major DTC bus stops and terminals."""
    stops = db.query(BusStop).all()
    return [
        {
            "id": b.id,
            "name": b.name,
            "latitude": b.latitude,
            "longitude": b.longitude,
            "routes": b.routes_serviced.split(", "),
            "is_terminal": b.is_terminal
        }
        for b in stops
    ]

@router.get("/fare-rules")
def get_transit_fare_rules(db: Session = Depends(get_db)):
    """Returns official DMRC and DTC distance slab fare rules."""
    rules = db.query(TransitFareRule).all()
    return rules

@router.get("/providers")
def get_provider_categories(db: Session = Depends(get_db)):
    """Returns registered ride-hailing and auto providers with tariff configurations."""
    cats = db.query(ProviderVehicleCategory).all()
    return cats
