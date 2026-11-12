from pathlib import Path

import pytest

from app.pdf import render_html, render_pdf

RESUME = (Path(__file__).parents[2] / "resume.md").read_text()


def test_markdown_converted_to_html():
    html = render_html("# Jane\n\n- one\n- two", "professional")
    assert "<h1>Jane</h1>" in html
    assert "<li>one</li>" in html


@pytest.mark.parametrize("style", ["professional", "modern", "classic"])
def test_each_style_renders_real_resume(style):
    pdf = render_pdf(RESUME, style)
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 5000


def test_styles_differ():
    assert render_html("# x", "classic") != render_html("# x", "modern")
