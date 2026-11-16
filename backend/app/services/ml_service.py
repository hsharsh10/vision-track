import os
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, Optional, Tuple
from datetime import datetime
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "ml", "model_registry")

class MLFareService:
    def __init__(self):
        os.makedirs(MODEL_DIR, exist_ok=True)
        self.models: Dict[str, Any] = {}
        self.metrics: Dict[str, Dict[str, float]] = {}
        self.load_or_train_all_models()

    def _get_model_key(self, provider_code: str, category_code: str) -> str:
        return f"{provider_code}_{category_code}"

    def load_or_train_all_models(self):
        """Loads trained models from disk, or trains baseline models from DB observations."""
        from backend.app.db.database import SessionLocal
        from backend.app.models.models import FareObservation, ProviderVehicleCategory

        db = SessionLocal()
        try:
            categories = db.query(ProviderVehicleCategory).all()
            for cat in categories:
                key = self._get_model_key(cat.provider_code, cat.category_code)
                model_file = os.path.join(MODEL_DIR, f"{key}.joblib")
                metrics_file = os.path.join(MODEL_DIR, f"{key}_metrics.joblib")

                if os.path.exists(model_file) and os.path.exists(metrics_file):
                    self.models[key] = joblib.load(model_file)
                    self.metrics[key] = joblib.load(metrics_file)
                else:
                    self._train_category_model(db, cat)
        finally:
            db.close()

    def _train_category_model(self, db, cat):
        from backend.app.models.models import FareObservation

        key = self._get_model_key(cat.provider_code, cat.category_code)
        observations = db.query(FareObservation).filter(
            FareObservation.category_code == cat.category_code
        ).all()

        if len(observations) < 30:
            # Not enough data yet, will use baseline fallback
            return

        records = []
        for o in observations:
            records.append({
                "distance_km": o.distance_km,
                "duration_min": o.duration_min,
                "hour_of_day": o.hour_of_day,
                "day_of_week": o.day_of_week,
                "is_weekend": 1 if o.is_weekend else 0,
                "is_peak_hour": 1 if o.is_peak_hour else 0,
                "pickup_lat": o.pickup_lat,
                "pickup_lon": o.pickup_lon,
                "quoted_fare": o.quoted_fare
            })

        df = pd.DataFrame(records)
        X = df.drop(columns=["quoted_fare"])
        y = df["quoted_fare"]

        # Train/test split
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        model = XGBRegressor(
            n_estimators=60,
            max_depth=4,
            learning_rate=0.08,
            subsample=0.85,
            random_state=42
        )
        model.fit(X_train, y_train)

        # Calibrate errors on test set
        preds = model.predict(X_test)
        abs_errors = np.abs(preds - y_test)
        mae = float(mean_absolute_error(y_test, preds))
        mdae = float(np.median(abs_errors))
        e90 = float(np.percentile(abs_errors, 90))

        metrics = {
            "mae": mae,
            "mdae": mdae,
            "e90": e90,
            "samples": len(df)
        }

        # Save artifacts
        model_file = os.path.join(MODEL_DIR, f"{key}.joblib")
        metrics_file = os.path.join(MODEL_DIR, f"{key}_metrics.joblib")
        joblib.dump(model, model_file)
        joblib.dump(metrics, metrics_file)

        self.models[key] = model
        self.metrics[key] = metrics

    def predict_fare(
        self,
        provider_code: str,
        category_code: str,
        distance_km: float,
        duration_min: float,
        pickup_lat: float,
        pickup_lon: float,
        travel_dt: Optional[datetime] = None,
        base_fare: float = 30.0,
        min_fare: float = 30.0
    ) -> Tuple[float, float, float, str]:
        """
        Predicts fare and calculates calibrated min/max range.
        Returns: (predicted_fare, range_min, range_max, confidence_level)
        """
        key = self._get_model_key(provider_code, category_code)
        now = travel_dt or datetime.now()
        hour = now.hour
        day = now.weekday()
        is_peak = (8 <= hour <= 11) or (17 <= hour <= 21)
        is_weekend = 1 if day >= 5 else 0

        model = self.models.get(key)
        metrics = self.metrics.get(key)

        if model is None:
            # Fallback to formula with uncertainty bounds
            baseline = max(min_fare, base_fare + (distance_km * 12.0) + (duration_min * 1.2))
            return round(baseline, 1), round(max(min_fare, baseline * 0.9), 1), round(baseline * 1.15, 1), "Low"

        # Feature vector
        feature_data = pd.DataFrame([{
            "distance_km": distance_km,
            "duration_min": duration_min,
            "hour_of_day": hour,
            "day_of_week": day,
            "is_weekend": is_weekend,
            "is_peak_hour": 1 if is_peak else 0,
            "pickup_lat": pickup_lat,
            "pickup_lon": pickup_lon
        }])

        pred_val = float(model.predict(feature_data)[0])
        pred_val = max(min_fare, round(pred_val, 1))

        # Calibrated spread according to approved specification
        mdae = metrics.get("mdae", 6.0)
        e90 = metrics.get("e90", 14.0)

        range_min = max(min_fare, round(pred_val - (1.25 * mdae), 1))
        range_max = round(pred_val + (1.25 * e90), 1)

        # Confidence assessment
        mae = metrics.get("mae", 8.0)
        if mae <= 7.0:
            confidence = "High"
        elif mae <= 15.0:
            confidence = "Medium"
        else:
            confidence = "Low"

        return pred_val, range_min, range_max, confidence

ml_service = MLFareService()
