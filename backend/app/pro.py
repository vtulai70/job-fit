"""Pro mode: several models write the resume in parallel and a judge model ranks them."""

import logging
import random
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

from openai import APITimeoutError, OpenAI
from pydantic import BaseModel, create_model

from app.ai import Model, ask_structured
from app.prompt import RULES
from app.routes.preferences import Preferences

log = logging.getLogger(__name__)

CANDIDATE_TIMEOUT = 300
WRITE_NOW = "Write the full custom resume now from our conversation. Do not ask questions."
NO_CANDIDATES = "No Pro model returned a resume. Please try again."
LABELS = ("A", "B", "C", "D")
Label = Literal["A", "B", "C", "D"]

JUDGE_INSTRUCTIONS = f"""\
# Role

You are an expert hiring manager and resume reviewer working inside the JobFit app.

# Task

Several resume writers tailored the user's baseline resume (below) to the job description (below).
Compare their candidate resumes, labelled A, B, C or D, and rank them by how likely each is to get the
user an interview for this job.

Judge each candidate on:
- Fit: how well it matches the company, the role, and the job's top keywords and requirements.
- Accuracy: it must follow every resume rule below. Compare it with the baseline resume and list each
  rule it breaks in rule_violations (e.g. an invented metric, a technology not in the baseline, a role in
  the wrong experience section, a graduation year when the preferences say to leave it out). A candidate
  that breaks a rule ranks below every candidate that does not.
- The user preferences below: length, tone, notes and optimization level.
- Clarity and readability.

# Resume rules the writers had to follow

{RULES}
# Output

Respond with JSON fields:
- ranking: one entry for EVERY candidate, best first, each with:
  - label: the candidate's letter only, e.g. "A"
  - score: 0 to 10, one decimal
  - strengths: one or two short sentences
  - weaknesses: one or two short sentences
  - rule_violations: each broken rule as a short sentence; empty list when none
- rationale: two or three sentences on why the best candidate beats the others.
"""


class Candidate(BaseModel):
    """A resume one Pro model wrote."""

    model: Model
    company: str | None
    resume_md: str


class Review(BaseModel):
    label: Label
    score: float
    strengths: str
    weaknesses: str
    rule_violations: list[str]


class Verdict(BaseModel):
    ranking: list[Review]
    rationale: str


def verdict_schema(labels: tuple[str, ...]) -> type[Verdict]:
    """A Verdict whose labels can only be the given ones, so the judge cannot rank a candidate that does not exist."""
    review = create_model("Review", __base__=Review, label=(Literal[labels], ...))
    return create_model("Verdict", __base__=Verdict, ranking=(list[review], ...))


class ProCandidate(Candidate):
    """A candidate with the judge's review; the review fields are None when there was nothing to compare."""

    score: float | None
    strengths: str
    weaknesses: str
    rule_violations: list[str]


class ProFailure(BaseModel):
    """A Pro model that returned no valid resume, and why (e.g. "timed out after 300 s")."""

    model: Model
    reason: str


class ProResult(BaseModel):
    """Candidates ranked best first (none when every Pro model failed); judge_model is None unless at least
    two were compared; failed lists the Pro models that were left out."""

    candidates: list[ProCandidate]
    rationale: str
    judge_model: Model | None
    failed: list[ProFailure] = []


def candidate_messages(messages: list[dict]) -> list[dict]:
    """The conversation with the last user message telling the model to write the resume now."""
    last = messages[-1]
    return [*messages[:-1], {"role": "user", "content": f"{last['content']}\n\n{WRITE_NOW}"}]


def write_candidate(client: OpenAI, messages: list[dict], model: Model, schema: type) -> Candidate | ProFailure:
    """One model's resume, or why it has none (an error, a timeout, or no resume returned)."""
    try:
        result = ask_structured(client.with_options(timeout=CANDIDATE_TIMEOUT), messages, schema, model)
    except APITimeoutError:
        log.warning("Pro candidate %s timed out", model)
        return ProFailure(model=model, reason=f"timed out after {CANDIDATE_TIMEOUT} s")
    except Exception:
        log.exception("Pro candidate %s failed", model)
        return ProFailure(model=model, reason="failed with an error")
    if not result.resume_md:
        log.warning("Pro candidate %s returned no resume: %s", model, result.reply)
        return ProFailure(model=model, reason="returned no resume")
    return Candidate(model=model, company=result.company, resume_md=result.resume_md)


def write_candidates(
    client: OpenAI, messages: list[dict], models: list[Model], schema: type
) -> tuple[list[Candidate], list[ProFailure]]:
    """Every model's resume, written in parallel, and the models that returned none."""
    with ThreadPoolExecutor(max_workers=len(models)) as pool:
        results = list(pool.map(lambda model: write_candidate(client, candidate_messages(messages), model, schema), models))
    return [r for r in results if isinstance(r, Candidate)], [r for r in results if isinstance(r, ProFailure)]


def judge_messages(context_text: str, labelled: dict[str, Candidate]) -> list[dict]:
    """System prompt with rules and context; the candidates by label only, so the judge cannot see the models."""
    resumes = "\n\n".join(f"# Candidate {label}\n\n{c.resume_md}" for label, c in labelled.items())
    return [
        {"role": "system", "content": f"{JUDGE_INSTRUCTIONS}\n{context_text}"},
        {"role": "user", "content": resumes},
    ]


def judge(client: OpenAI, context_text: str, candidates: list[Candidate], judge_model: Model) -> ProResult:
    """Rank the candidates, shown to the judge in a shuffled order."""
    labelled = dict(zip(LABELS, random.sample(candidates, len(candidates))))
    verdict = ask_structured(client, judge_messages(context_text, labelled), verdict_schema(tuple(labelled)), judge_model)
    ranked = [
        ProCandidate(**labelled[r.label].model_dump(), **r.model_dump(exclude={"label"}))
        for r in verdict.ranking
    ]
    return ProResult(candidates=ranked, rationale=verdict.rationale, judge_model=judge_model)


def unjudged(candidate: Candidate) -> ProResult:
    """The only candidate that returned a resume, with nothing to compare it with."""
    only = ProCandidate(**candidate.model_dump(), score=None, strengths="", weaknesses="", rule_violations=[])
    return ProResult(
        candidates=[only], rationale=f"Only {candidate.model} returned a resume, so nothing was compared.", judge_model=None
    )


def run_pro(client: OpenAI, messages: list[dict], context_text: str, prefs: Preferences, schema: type) -> ProResult:
    """Write the candidates with the Pro models, then rank them with the AI model as judge; failures are reported."""
    candidates, failed = write_candidates(client, messages, prefs.pro_models, schema)
    if not candidates:
        result = ProResult(candidates=[], rationale=NO_CANDIDATES, judge_model=None)
    elif len(candidates) == 1:
        result = unjudged(candidates[0])
    else:
        result = judge(client, context_text, candidates, prefs.model)
    return result.model_copy(update={"failed": failed})
