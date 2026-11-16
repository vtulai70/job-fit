"""Subscription plans (Clerk Billing): the user's plan and features from the session token, and its limits."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import Claims, UserId
from app.db import Db

router = APIRouter(prefix="/api/plan")

FREE = "free"
# Resumes per calendar month (UTC) by Clerk plan key; Clerk Billing has no usage quotas.
MONTHLY_GENERATIONS = {FREE: 5, "basic": 50, "pro": 200}


class Plan(BaseModel):
    """The user's Clerk plan key and enabled feature keys."""

    key: str
    features: list[str]

    def has(self, feature: str) -> bool:
        return feature in self.features

    @property
    def limit(self) -> int:
        """Monthly resume limit; a plan added in Clerk but not here gets the free limit."""
        return MONTHLY_GENERATIONS.get(self.key, MONTHLY_GENERATIONS[FREE])


def without_scope(item: str) -> str:
    """'u:pro' -> 'pro' (u: user, o: organization)."""
    return item.split(":", 1)[-1]


def plan_from_claims(claims: dict) -> Plan:
    """Plan from the session token v2 claims `pla` ('u:pro') and `fea` ('u:a,u:b', absent when none)."""
    features = sorted(without_scope(f) for f in (claims.get("fea") or "").split(",") if f)
    return Plan(key=without_scope(claims.get("pla") or f"u:{FREE}"), features=features)


def current_plan(claims: Claims) -> Plan:
    """The signed-in user's plan."""
    return plan_from_claims(claims)


CurrentPlan = Annotated[Plan, Depends(current_plan)]


def iso(moment: datetime) -> str:
    """ISO-8601 UTC text, as the database stores timestamps."""
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def month_start(moment: datetime) -> datetime:
    return moment.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def next_month_start(moment: datetime) -> datetime:
    start = month_start(moment)
    return start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)


def used_this_month(db: Db, user_id: int, moment: datetime) -> int:
    """Resumes the user produced in the calendar month (UTC) of the given moment."""
    since = iso(month_start(moment))
    query = "SELECT COUNT(*) FROM generations WHERE user_id = ? AND generated_at >= ?"
    return db.execute(query, (user_id, since)).fetchone()[0]


def record_generations(db: Db, user_id: int, models: list[str], pro: bool, moment: datetime) -> None:
    """One row per resume produced: a normal generation is one model, a Pro run one per candidate."""
    db.executemany(
        "INSERT INTO generations (user_id, generated_at, model, pro) VALUES (?, ?, ?, ?)",
        [(user_id, iso(moment), model, int(pro)) for model in models],
    )


def utc_now() -> datetime:
    return datetime.now(UTC)


class PlanInfo(BaseModel):
    plan: str
    features: list[str]
    limit: int
    used: int
    resets_at: str


@router.get("")
def get_plan(plan: CurrentPlan, user_id: UserId, db: Db) -> PlanInfo:
    """The user's plan, features, monthly resume limit, resumes used this month and when the count resets."""
    moment = utc_now()
    return PlanInfo(
        plan=plan.key,
        features=plan.features,
        limit=plan.limit,
        used=used_this_month(db, user_id, moment),
        resets_at=iso(next_month_start(moment)),
    )
