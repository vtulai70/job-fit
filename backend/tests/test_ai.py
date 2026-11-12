from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app import ai
from app.main import app


def fake_client(answer: str) -> MagicMock:
    """OpenAI client stand-in whose chat completion returns the given text."""
    client = MagicMock()
    message = SimpleNamespace(content=answer)
    client.chat.completions.create.return_value = SimpleNamespace(choices=[SimpleNamespace(message=message)])
    return client


@pytest.fixture
def mock_ai():
    client = fake_client("4")
    app.dependency_overrides[ai.get_client] = lambda: client
    yield client
    app.dependency_overrides.clear()


def test_client_points_at_openrouter(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    client = ai.get_client()
    assert str(client.base_url).rstrip("/") == "https://openrouter.ai/api/v1"
    assert client.api_key == "test-key"


def test_ask_sends_model_and_question():
    client = fake_client("hello")
    assert ai.ask(client, "hi?") == "hello"
    client.chat.completions.create.assert_called_once_with(
        model="openai/gpt-oss-120b", messages=[{"role": "user", "content": "hi?"}]
    )


def test_check_route_returns_answer(signed_in, mock_ai):
    response = signed_in.get("/api/ai/check")
    assert response.status_code == 200
    assert response.json() == {"model": "openai/gpt-oss-120b", "answer": "4"}
    question = mock_ai.chat.completions.create.call_args.kwargs["messages"][0]["content"]
    assert "2+2" in question


def test_check_requires_session(client, mock_ai):
    assert client.get("/api/ai/check").status_code == 401
    mock_ai.chat.completions.create.assert_not_called()


@pytest.mark.integration
def test_real_openrouter_two_plus_two():
    answer = ai.ask(ai.get_client(), "What is 2+2? Reply with the number only.")
    assert "4" in answer
