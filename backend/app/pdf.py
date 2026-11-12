"""Render resume markdown to PDF in one of three visual styles."""

from markdown import markdown
from weasyprint import HTML

BASE_CSS = """
@page { size: Letter; margin: 0.7in; }
body { font-size: 10.5pt; line-height: 1.4; color: #1f2937; }
h1 { font-size: 20pt; margin: 0 0 4pt; }
h2 { font-size: 13pt; margin: 14pt 0 4pt; }
h3 { font-size: 11pt; margin: 10pt 0 2pt; }
ul { margin: 2pt 0; padding-left: 16pt; }
p { margin: 3pt 0; }
"""

STYLE_CSS = {
    "professional": """
        body { font-family: "Helvetica", "Arial", sans-serif; }
        h1, h2 { color: #0c4a6e; }
        h2 { border-bottom: 1pt solid #0c4a6e; padding-bottom: 2pt; }
    """,
    "modern": """
        body { font-family: "Helvetica", "Arial", sans-serif; }
        h1 { color: #0284c7; font-weight: 300; font-size: 24pt; }
        h2 { color: #0284c7; text-transform: uppercase; letter-spacing: 1pt; font-size: 11pt; }
    """,
    "classic": """
        body { font-family: "Georgia", "Times New Roman", serif; }
        h1 { text-align: center; }
        h2 { border-bottom: 0.5pt solid #000; font-variant: small-caps; }
    """,
}


def render_html(content_md: str, style: str) -> str:
    """Markdown resume to a standalone HTML document."""
    body = markdown(content_md, extensions=["extra", "sane_lists"])
    css = BASE_CSS + STYLE_CSS[style]
    return f"<html><head><meta charset='utf-8'><style>{css}</style></head><body>{body}</body></html>"


def render_pdf(content_md: str, style: str) -> bytes:
    """Markdown resume to PDF bytes."""
    return HTML(string=render_html(content_md, style)).write_pdf()
