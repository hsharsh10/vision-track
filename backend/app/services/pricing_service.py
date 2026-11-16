from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from backend.app.models.models import FareObservation, ProviderVehicleCategory
from backend.app.schemas.schemas import FareEstimate, FareSource
from backend.app.services.ml_service import ml_service

class PricingService:
    def __init__(self):
        # In-memory fast corridor cache for Tier 2 observed lookups
        self.recent_cache: Dict[str, Dict[str, Any]] = {}

    def get_ride_fare_estimate(
        self,
        db: Session,
        provider_code: str,
        category_code: str,
        distance_km: float,
        duration_min: float,
        pickup_lat: float,
        pickup_lon: float,
        drop_lat: float,
        drop_lon: float,
        travel_dt: Optional[datetime] = None
    ) -> FareEstimate:
        now = travel_dt or datetime.utcnow()

        cat = db.query(ProviderVehicleCategory).filter(
            ProviderVehicleCategory.category_code == category_code
        ).first()

        base_fare = cat.base_fare if cat else 30.0
        min_fare = cat.minimum_fare if cat else 30.0

        # Special Tier for Govt Metered Auto (GNCTD official formula)
        if provider_code == "delhi_govt" or category_code == "govt_metered_auto":
            is_night = (now.hour >= 23 or now.hour < 5)
            extra_km = max(0.0, distance_km - 1.5)
            subtotal = 30.0 + (extra_km * 11.0) + (5.0 * 0.75)
            night_surcharge = subtotal * 0.25 if is_night else 0.0
            total = round(subtotal + night_surcharge, 1)

            return FareEstimate(
                fare_inr=total,
                range_min=round(total * 0.95, 1),
                range_max=round(total * 1.05, 1),
                confidence="High",
                source=FareSource.ESTIMATED_FALLBACK,
                data_freshness_desc="Official Delhi Transport Dept Metered Gazette",
                details={
                    "base_fare": 30.0,
                    "per_km_rate": 11.0,
                    "night_surcharge_inr": night_surcharge,
                    "meter_type": "GNCTD Approved Electronic Meter"
                }
            )

        # -------------------------------------------------------------
        # TIER 1: Authorized Live Provider Quote
        # -------------------------------------------------------------
        # In production, check live authorized provider API (e.g. Uber Ride Estimates API).
        # We strictly adhere to transparency guidelines: never fake live quotes.
        # If live API is not configured, we proceed to Tier 2.

        # -------------------------------------------------------------
        # TIER 2: Recent Observed Provider Fare Corridor (< 15 mins)
        # -------------------------------------------------------------
        time_cutoff = now - timedelta(minutes=15)
        # Check DB for fresh matching observations
        recent_obs = db.query(FareObservation).filter(
            FareObservation.category_code == category_code,
            FareObservation.recorded_at >= time_cutoff,
            FareObservation.distance_km.between(distance_km * 0.9, distance_km * 1.1)
        ).order_by(FareObservation.recorded_at.desc()).first()

        if recent_obs:
            return FareEstimate(
                fare_inr=round(recent_obs.quoted_fare, 1),
                range_min=round(recent_obs.quoted_fare * 0.95, 1),
                range_max=round(recent_obs.quoted_fare * 1.05, 1),
                confidence="High",
                source=FareSource.OBSERVED,
                data_freshness_desc=f"Observed on corridor at {recent_obs.recorded_at.strftime('%H:%M')}",
                details={"observed_surge": recent_obs.surge_multiplier, "source_id": recent_obs.id}
            )

        # -------------------------------------------------------------
        # TIER 3: Machine Learning Fare Prediction (XGBoost Regressor)
        # -------------------------------------------------------------
        try:
            pred_fare, range_min, range_max, confidence = ml_service.predict_fare(
                provider_code=provider_code,
                category_code=category_code,
                distance_km=distance_km,
                duration_min=duration_min,
                pickup_lat=pickup_lat,
                pickup_lon=pickup_lon,
                travel_dt=now,
                base_fare=base_fare,
                min_fare=min_fare
            )

            return FareEstimate(
                fare_inr=pred_fare,
                range_min=range_min,
                range_max=range_max,
                confidence=confidence,
                source=FareSource.ML_PREDICTED,
                data_freshness_desc="Calibrated XGBoost Ensemble with MdAE error bounds",
                details={
                    "model": "XGBoost Regressor v1.0",
                    "calibrated_spread": round(range_max - range_min, 1)
                }
            )
        except Exception:
            pass

        # -------------------------------------------------------------
        # TIER 4: Baseline Formula Fallback
        # -------------------------------------------------------------
        chargeable_km = max(0.0, distance_km - (cat.base_distance_km if cat else 1.0))
        km_cost = chargeable_km * (cat.per_km_rate if cat else 14.0)
        time_cost = duration_min * (cat.per_minute_rate if cat else 1.5)
        raw_total = base_fare + km_cost + time_cost
        fare_final = max(min_fare, round(raw_total, 1))

        return FareEstimate(
            fare_inr=fare_final,
            range_min=round(fare_final * 0.88, 1),
            range_max=round(fare_final * 1.15, 1),
            confidence="Medium",
            source=FareSource.ESTIMATED_FALLBACK,
            data_freshness_desc="Calculated from provider regulatory base tariff",
            details={"fallback": "Base + PerKm + PerMin"}
        )

pricing_service = PricingService()
