from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from db.session import engine
from auth.router import router as auth_router
from complaint.router import router as complaint_router
from admin.router import router as admin_router
from geocode.router import router as geocode_router
from detect.router import router as detect_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    import models  # Ensure models are loaded before create_all
    models.Base.metadata.create_all(bind=engine)
    print("Database tables created")
    
    yield
    
    # Shutdown
    print("Shutting down")


app = FastAPI(
    title="JanSewa - Civic Complaint Prioritization System",
    description="API for civic complaint reporting, prioritization, and management",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
cors_origins_env = os.getenv("CORS_ORIGINS", "")
allowed_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]
if not allowed_origins:
    allowed_origins = ["*"]
else:
    allowed_origins.extend(["http://localhost:3000", "http://localhost:5173"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(complaint_router)
app.include_router(admin_router)
app.include_router(geocode_router)
app.include_router(detect_router)


# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "civic-complaint-api"}


# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "JanSewa - Civic Complaint Prioritization System API",
        "version": "1.0.0",
        "docs": "/docs"
    }


# Static files for uploaded evidence
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)