# GatiMarg: India's AI-Powered Multimodal Mobility Decision Engine (Delhi NCR Pilot)

[![Python 3.11](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://react.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/TailwindCSS-v4.0-38bdf8.svg)](https://tailwindcss.com/)
[![XGBoost](https://img.shields.io/badge/XGBoost-Ensemble-orange.svg)](https://xgboost.readthedocs.io/)
[![Tests](https://img.shields.io/badge/Tests-7%20Passed-brightgreen.svg)]()

**GatiMarg** is a production-ready, intelligent multimodal transportation comparison and route optimization web application tailored for Indian urban transit, piloted in **Delhi NCR**.

It computes and ranks composite hybrid journeys (e.g., `Rapido Auto → DMRC Metro (Yellow Line) → Walk 300m → Destination`) against direct ride-hailing options (Uber, Ola, Rapido, Delhi Metered Auto), optimizing for travel time, cost, convenience, and carbon emissions.

---

## 🚀 Key Features

1. **Multimodal Journey Synthesis**:
   - Evaluates combinations of **DMRC Metro** (Yellow, Blue, Red, Pink, Magenta, Violet, Airport Express, Rapid Metro, Aqua Line), **DTC AC/Non-AC Buses**, **Rapido Auto/Bike**, **Uber Go/Auto/Moto**, **Ola Cab/Auto**, **Delhi Govt Metered Auto**, and **Walking**.
   - NetworkX-powered graph traversal computes station-to-station paths, line transfers, dwell times, and 4-minute interchange buffers.

2. **4-Tier Hierarchical Fare Prediction**:
   - **Tier 1 (Authorized Live Quotes)**: Uses verified provider partner API tokens if configured. Never fakes live quotes.
   - **Tier 2 (Corridor Cache)**: Fresh (<15 min) observed prices for identical origin-destination corridors.
   - **Tier 3 (Calibrated ML Regressors)**: Independent **XGBoost** models per provider and vehicle category, calibrated with **Median Absolute Error (MdAE)** and **90th percentile error (E90)** test spreads.
   - **Tier 4 (Official Regulatory Fallbacks)**: Base + Distance + Time formulas derived from official tariffs.

3. **Ground-Truth Delhi NCR Transit Rules**:
   - **DMRC Slabs**: `0–2km: ₹11`, `2–5km: ₹21`, `5–12km: ₹32`, `12–21km: ₹43`, `21–32km: ₹54`, `>32km: ₹64`.
   - **Smart Card Discount**: 10% standard off-token discount + additional 10% off-peak discount.
   - **DTC Buses**: Non-AC (₹5, ₹10, ₹15) and AC (₹10, ₹15, ₹20, ₹25).
   - **Pink Pass**: Zero-fare bus travel for female commuters.
   - **Delhi Metered Auto**: GNCTD approved electronic meter formula (₹30 for first 1.5km + ₹11/km + 25% night surcharge 11PM–5AM).

4. **Multi-Criteria Recommendation Engine**:
   - **Best Overall**: Pareto optimization `(0.40 × Cost + 0.35 × Time + 0.15 × Walk + 0.10 × Transfers)`.
   - **Fastest**: Prioritizes door-to-door transit speed.
   - **Cheapest**: Maximizes savings against direct cabs.
   - **Comfortable**: Minimizes foot travel and switches.
   - **Eco-Friendly**: Minimizes greenhouse gas emissions (calculates kg CO₂ saved).

5. **Data Transparency & User Controls**:
   - Visual badges on every card: `LIVE_API`, `OBSERVED`, `ML_PREDICTED`, `OFFICIAL_TARIFF`.
   - Sliders for maximum walking distance (300m to 3.5km) and trip budget caps.
   - Interactive Leaflet map displaying color-coded lines and interchange stations.

---

## 🛠️ Architecture

```
taxi recommendation/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI application & lifespan setup
│   │   ├── db/database.py              # SQLite / PostGIS SQLAlchemy session
│   │   ├── models/models.py            # Stations, FareRules, Vehicles, Observations
│   │   ├── schemas/schemas.py          # Pydantic validation contracts
│   │   ├── services/
│   │   │   ├── routing_service.py      # Multimodal synthesis & ranking
│   │   │   ├── transit_service.py      # NetworkX DMRC graph & fare rules
│   │   │   ├── pricing_service.py      # 4-Tier pricing hierarchy
│   │   │   └── ml_service.py           # XGBoost training & error calibration
│   │   ├── api/
│   │   │   ├── routes.py               # /api/v1/routes/search
│   │   │   ├── fares.py                # /api/v1/fares/estimate
│   │   │   ├── transit.py              # /api/v1/transit/stations
│   │   │   └── preferences.py          # /api/v1/preferences
│   │   └── seed_data/seed.py           # Delhi NCR DMRC & DTC seed loader
│   ├── tests/test_routing.py           # Pytest automated test suite
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/                 # SearchWidget, RouteCard, MapView, Modals
│   │   ├── store/mobilityStore.ts      # Zustand state store
│   │   ├── api/client.ts               # Axios API client
│   │   ├── types/index.ts              # TypeScript interfaces
│   │   ├── App.tsx                     # Main layout
│   │   └── main.tsx
│   ├── vite.config.ts                  # Tailwind v4 & API reverse proxy
│   ├── Dockerfile
│   └── vercel.json
├── docker-compose.yml                  # PostgreSQL + PostGIS + Backend + Frontend
└── .env.example
```

---

## 🏃 Quick Start Guide

### 1. Prerequisites
- Python 3.11+
- Node.js 18+ and npm

### 2. Backend Setup
```bash
# From workspace root:
cd backend

# Install dependencies
pip install -r requirements.txt

# Run migrations & seed Delhi NCR transit data (DMRC stations, fare slabs, auto meters)
python -m backend.app.seed_data.seed

# Start FastAPI server
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
The interactive Swagger API documentation will be available at: `http://localhost:8000/docs`

### 3. Frontend Setup
```bash
# Open a new terminal in frontend directory:
cd frontend

# Install packages
npm install

# Start Vite dev server
npm run dev
```
Open your browser at `http://localhost:5173`. The Vite proxy automatically routes `/api` calls to `http://localhost:8000`.

---

## 🧪 Running Automated Tests

Run the complete test suite verifying DMRC slabs, auto meter math, multimodal route search, and budget constraints:

```bash
python -m pytest backend/tests/test_routing.py -v
```

All 7 test cases pass out-of-the-box:
- `test_health_check`
- `test_popular_corridors_api`
- `test_dmrc_official_fare_slabs`
- `test_delhi_metered_auto_formula`
- `test_dtc_bus_pink_pass_zero_fare`
- `test_multimodal_route_search`
- `test_constraint_max_budget_enforcement`

---

## 🚢 Deployment

### Docker Compose
Run the entire stack (PostGIS + FastAPI + Frontend) in one command:
```bash
docker-compose up --build -d
```

### Cloud Providers
- **Frontend**: Deploy `frontend/` to **Vercel** (`vercel.json` included).
- **Backend**: Deploy `backend/` to **Render** or **Fly.io** with environment variable `DATABASE_URL` pointing to your managed PostgreSQL/PostGIS database.
