"""JobFit FastAPI application: JSON API under /api and static site at /."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from app import ai, db, logs, plans
from app.db import init_db
from app.routes import generate, history, preferences, preview, resume

STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).parent.parent / "static"))
log = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Set up logging and create the database on startup if it does not exist."""
    logs.configure_logging()
    log.info(
        "Starting JobFit: db=%s static=%s log=%s level=%s default model=%s",
        db.DB_PATH, STATIC_DIR, logs.LOG_FILE, logs.LOG_LEVEL, ai.MODEL,
    )
    init_db()
    yield
    log.info("Stopping JobFit")


app = FastAPI(title="JobFit", lifespan=lifespan)
app.middleware("http")(logs.log_requests)
app.add_exception_handler(HTTPException, logs.log_http_error)
app.add_exception_handler(RequestValidationError, logs.log_validation_error)
ROUTERS = (resume.router, history.router, preferences.router, preview.router, ai.router, generate.router, plans.router)
for router in ROUTERS:
    app.include_router(router)


@app.get("/api/health")
def health() -> dict[str, str]:
    """Report that the API is up."""
    return {"status": "ok"}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
