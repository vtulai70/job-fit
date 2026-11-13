"""HTML preview of a custom resume, rendered exactly as for the PDF."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth import UserId
from app.pdf import render_html
from app.routes.preferences import Style

router = APIRouter(prefix="/api/preview")


class PreviewIn(BaseModel):
    content_md: str
    style: Style


class PreviewOut(BaseModel):
    html: str


@router.post("")
def preview(body: PreviewIn, user_id: UserId) -> PreviewOut:
    """The standalone HTML document the PDF is rendered from."""
    return PreviewOut(html=render_html(body.content_md, body.style))
