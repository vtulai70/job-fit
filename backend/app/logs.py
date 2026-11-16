"""Logging: one format for the app, to stderr and a rotating file, with the request id and user on every line.

Resume, job description and chat text are never logged; only ids, sizes, models, timings and errors.
"""

import logging
import os
import time
import uuid
from contextvars import ContextVar
from logging.handlers import RotatingFileHandler
from pathlib import Path

from fastapi import Request, Response
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

LOG_FILE = Path(os.environ.get("LOG_FILE", "data/logs/jobfit.log"))
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
FORMAT = "%(asctime)s %(levelname)s %(name)s [%(request_id)s %(user)s] %(message)s"
QUIET_PATHS = {"/api/health"}

# One record per request, created by the middleware: FastAPI runs sync dependencies and routes in worker
# threads with copies of the context, so the user is filled in on this shared record, not set on a variable.
current: ContextVar[dict[str, str]] = ContextVar("current", default={"request_id": "-", "user": "-"})
log = logging.getLogger("app.requests")


class RequestContext(logging.Filter):
    """Adds the current request id and user to every record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id, record.user = current.get()["request_id"], current.get()["user"]
        return True


def set_user(clerk_id: str) -> None:
    """Name the signed-in user on every later log line of this request."""
    current.get()["user"] = clerk_id


def configure_logging() -> None:
    """Send the app's loggers (`app.*`) to stderr and a rotating file (`LOG_FILE`, 5 x 5 MB) in one format."""
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter(FORMAT)
    handlers = [logging.StreamHandler(), RotatingFileHandler(LOG_FILE, maxBytes=5_000_000, backupCount=5)]
    app_log = logging.getLogger("app")
    for old in app_log.handlers:
        old.close()
    app_log.handlers.clear()
    for handler in handlers:
        handler.setFormatter(formatter)
        handler.addFilter(RequestContext())
        app_log.addHandler(handler)
    app_log.setLevel(LOG_LEVEL)
    app_log.propagate = False


async def log_requests(request: Request, call_next) -> Response:
    """Middleware: give each request an id (also returned as X-Request-ID) and log its outcome and duration;
    log unhandled errors with their traceback."""
    current.set({"request_id": uuid.uuid4().hex[:8], "user": "-"})
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("%s %s failed with an unhandled error", request.method, request.url.path)
        raise
    ms = (time.perf_counter() - started) * 1000
    if request.url.path.startswith("/api"):
        level = logging.DEBUG if request.url.path in QUIET_PATHS else logging.INFO
        log.log(level, "%s %s -> %d in %.0f ms", request.method, request.url.path, response.status_code, ms)
    response.headers["X-Request-ID"] = current.get()["request_id"]
    return response


async def log_http_error(request: Request, exc: HTTPException) -> Response:
    """Log the reason for a 4xx/5xx raised by a route, then answer as FastAPI does."""
    log.warning("%s %s -> %d: %s", request.method, request.url.path, exc.status_code, exc.detail)
    return await http_exception_handler(request, exc)


async def log_validation_error(request: Request, exc: RequestValidationError) -> Response:
    """Log where a request body failed validation (locations and messages only, never the values)."""
    problems = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
    log.warning("%s %s -> 422: %s", request.method, request.url.path, problems)
    return await request_validation_exception_handler(request, exc)
