"""Download history of custom resumes, and PDF re-download."""

import re
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app.ai import Model
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
    model: Model


class HistoryEntry(BaseModel):
    id: int
    company: str
    style: Style
    downloaded_at: str
    model: str | None


@router.get("")
def list_history(user_id: UserId, db: Db) -> list[HistoryEntry]:
    """All downloads for the user, newest first."""
    rows = db.execute(
        "SELECT id, company, style, downloaded_at, model FROM custom_resumes WHERE user_id = ? "
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
        "(user_id, company, job_description, content_md, style, downloaded_at, model) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, body.company, body.job_description, body.content_md, body.style, downloaded_at, body.model),
    )
    return HistoryEntry(
        id=cursor.lastrowid, company=body.company, style=body.style, downloaded_at=downloaded_at, model=body.model
    )


@router.delete("", status_code=204)
def clear_history(user_id: UserId, db: Db) -> None:
    """Delete all of the user's downloads."""
    db.execute("DELETE FROM custom_resumes WHERE user_id = ?", (user_id,))


@router.get("/{entry_id}/pdf")
def history_pdf(entry_id: int, user_id: UserId, db: Db) -> Response:
    """Render a past download as PDF."""
    row = db.execute(
        "SELECT company, content_md, style FROM custom_resumes WHERE id = ? AND user_id = ?",
        (entry_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    filename = pdf_filename(row["content_md"], row["company"])
    return Response(
        render_pdf(row["content_md"], row["style"]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


def clean(text: str) -> str:
    """Drop characters not allowed in file names and collapse whitespace."""
    return " ".join(re.sub(r'[\\/:*?"<>|\x00-\x1f]', " ", text).split())


def pdf_filename(content_md: str, company: str) -> str:
    """'Resume - <name> - <company>.pdf', the name taken from the resume's top '# ' heading."""
    heading = re.search(r"^# +(.+)$", content_md, re.MULTILINE)
    parts = ["Resume", clean(heading[1]) if heading else "", clean(company)]
    return " - ".join(part for part in parts if part) + ".pdf"
