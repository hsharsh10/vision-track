from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from backend.app.db.database import engine, Base, SessionLocal
from backend.app.seed_data.seed import seed_database
from backend.app.services.transit_service import transit_service
from backend.app.services.ml_service import ml_service
from backend.app.api.routes import router as routes_router
from backend.app.api.fares import router as fares_router
from backend.app.api.transit import router as transit_router
from backend.app.api.preferences import router as preferences_router
from backend.app.api.location import router as location_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure DB schema & seed data exists
    seed_database()
    db = SessionLocal()
    try:
        transit_service.build_network_graph(db)
        print("Metro transit graph initialized successfully.")
    finally:
        db.close()
    yield
    # Shutdown
    print("Shutting down Multimodal Mobility Engine.")

app = FastAPI(
    title="India's Multimodal Mobility Decision Engine",
    description="Intelligent transportation comparison, multimodal routing, and calibrated fare prediction for Delhi NCR.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(routes_router, prefix="/api/v1")
app.include_router(fares_router, prefix="/api/v1")
app.include_router(transit_router, prefix="/api/v1")
app.include_router(preferences_router, prefix="/api/v1")
app.include_router(location_router, prefix="/api/v1")

@app.get("/")
def root():
    return {
        "engine": "India Multimodal Mobility Decision Engine",
        "city_pilot": "Delhi NCR",
        "version": "1.0.0",
        "docs_url": "/docs",
        "supported_modes": ["DMRC Metro", "DTC Bus", "Uber", "Ola", "Rapido", "Metered Auto", "Walking"],
        "recommendation_tiers": ["Fastest", "Cheapest", "Comfortable", "Best Overall", "Least Walking", "Least Transfers", "Eco-Friendly"]
    }

@app.get("/health")
def health():
    return {"status": "healthy", "service": "mobility-engine-backend"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
