"""Download history of custom resumes, and PDF re-download."""

import re

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app.auth import UserId
from app.db import Db, now
from app.pdf import render_pdf
from app.routes.preferences import Style

router = APIRouter(prefix="/api/history")


class HistoryIn(BaseModel):
    company: str
    job_description: str
    content_md: str
    style: Style


class HistoryEntry(BaseModel):
    id: int
    company: str
    style: Style
    downloaded_at: str


@router.get("")
def list_history(user_id: UserId, db: Db) -> list[HistoryEntry]:
    """All downloads for the user, newest first."""
    rows = db.execute(
        "SELECT id, company, style, downloaded_at FROM custom_resumes WHERE user_id = ? "
        "ORDER BY downloaded_at DESC, id DESC",
        (user_id,),
    ).fetchall()
    return [HistoryEntry(**row) for row in rows]


@router.post("", status_code=201)
def add_history(body: HistoryIn, user_id: UserId, db: Db) -> HistoryEntry:
    """Record a download."""
    downloaded_at = now()
    cursor = db.execute(
        "INSERT INTO custom_resumes "
        "(user_id, company, job_description, content_md, style, downloaded_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, body.company, body.job_description, body.content_md, body.style, downloaded_at),
    )
    return HistoryEntry(
        id=cursor.lastrowid, company=body.company, style=body.style, downloaded_at=downloaded_at
    )


@router.get("/{entry_id}/pdf")
def history_pdf(entry_id: int, user_id: UserId, db: Db) -> Response:
    """Render a past download as PDF."""
    row = db.execute(
        "SELECT company, content_md, style FROM custom_resumes WHERE id = ? AND user_id = ?",
        (entry_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    slug = re.sub(r"[^A-Za-z0-9]+", "-", row["company"]).strip("-")
    filename = f"resume-{slug or 'custom'}.pdf"
    return Response(
        render_pdf(row["content_md"], row["style"]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
