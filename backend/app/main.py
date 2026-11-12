"""JobFit FastAPI application: JSON API under /api and static site at /."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app import ai
from app.db import init_db
from app.routes import generate, history, preferences, resume

STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).parent.parent / "static"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create the database on startup if it does not exist."""
    init_db()
    yield


app = FastAPI(title="JobFit", lifespan=lifespan)
ROUTERS = (resume.router, history.router, preferences.router, ai.router, generate.router)
for router in ROUTERS:
    app.include_router(router)


@app.get("/api/health")
def health() -> dict[str, str]:
    """Report that the API is up."""
    return {"status": "ok"}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
