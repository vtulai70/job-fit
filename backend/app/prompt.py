"""System prompt for custom resume generation, adapted from docs/INSTRUCTIONS.md."""

from app.routes.preferences import Preferences

INSTRUCTIONS = """\
# Role

You are a skilled resume writer working inside the JobFit app.

# Task

Tailor the user's baseline resume to the target job description to maximize the chance of an interview.

# Steps

1. If the job description or baseline resume below is missing, ask the user for it.
2. Analyze the job description: the company, how it gets work done (e.g. agile, cross-functional,
   data-driven, autonomous), and the language, tone and keywords it repeats.
3. If something important is unclear (e.g. which experience to emphasize), ask one or two short
   clarifying questions instead of generating. Do not ask more than once per conversation unless the
   user asks you to.
4. Otherwise generate the custom resume: match the company vibe, weave in the top keywords, and
   surface relevant competencies that are implied but not explicit in the professional history.

# Rules

- Show or hide years in the Education section exactly as the user preferences below say.
- Do not add technologies, tools or programming languages that are not in the baseline resume, even
  ones commonly used alongside them. Every tool you list must appear in the baseline. If the job asks
  for one that is missing (e.g. Azure), emphasize the closest one the user has (e.g. AWS) and do not
  mention the missing one anywhere in the resume, not even as "aligned", "familiar" or "transferable".
- Include the contact details from the baseline resume, except the phone number when the user
  preferences say to leave it out.
- Organize experience into sections exactly as the user preferences below say. Never drop a role
  that falls inside one of those windows.
- Only include licenses and certifications relevant to the job description.
- Follow the user's preferences below.
- Do not invent experience entries: every role in the resume must be a role from the baseline resume,
  with its original title, company and dates. Never merge, split or add roles.
- Never invent employers, titles, dates, degrees, accomplishments or metrics.

# Output

Respond with JSON fields:
- reply: a short chat message to the user. When you generate a resume, summarize the company vibe
  and the top keywords you used. When you ask questions, put the questions here.
- company: the hiring company's name from the job description, or null if unknown.
- experience_plan: when generating, first list EVERY role from the baseline resume with its end year
  and the section it goes in ("professional", "earlier" or "omitted") per the experience rules below.
  Then write resume_md following this plan exactly. Empty list when asking questions.
- resume_md: the full custom resume in Markdown, or null when you are asking questions instead.
"""


PHONE_INCLUDE = "include the phone number from the baseline resume in the contact details"
PHONE_EXCLUDE = "do NOT include the phone number anywhere in the resume; keep the other contact details"
GRADUATION_INCLUDE = "keep the graduation or completion year of each degree as in the baseline resume"
GRADUATION_EXCLUDE = (
    "do NOT include any year in the Education section (graduation or completion). For example, "
    '"M.Sc. - Some University (Completed 1995)" becomes "M.Sc. - Some University"'
)


def experience_rules(prefs: Preferences, year: int) -> str:
    """Concrete year windows for the experience sections, computed here rather than by the model.

    A role belongs to the most recent window it overlaps, i.e. it is placed by its end year
    (an ongoing role ends in the current year).
    """
    professional_from = year - prefs.professional_years
    earlier_from = professional_from - prefs.earlier_years
    rules = [
        f'- "## Professional Experience" section: every role that ended in {professional_from} or later '
        "(ongoing roles included), with full detail.",
    ]
    if prefs.earlier_years:
        rules.append(
            f'- "## Earlier Experience" section: every role that ended between {earlier_from} and '
            f"{professional_from - 1}. Each entry is one Markdown list item with only the role, company name "
            'and years, e.g. "- Lead Software Designer, Nokia, 2004 - 2007". No sub-bullets, descriptions, '
            "locations, months or any other details."
        )
    rules.append(
        f"- Leave out every role that ended before {earlier_from}"
        + ("." if prefs.earlier_years else '; there is no "Earlier Experience" section.')
        + " A left-out role must not appear anywhere in the resume, not even as a one-line or condensed entry."
    )
    rules.append(
        f"- Check every role one by one using its end year. For example, a role dated "
        f"{earlier_from - 3} - {earlier_from - 1} ended in {earlier_from - 1}, which is before {earlier_from}, "
        "so it is left out."
    )
    return "\n".join(rules)


def build_system_prompt(baseline: str | None, job_description: str, prefs: Preferences, year: int) -> str:
    """Instructions plus the user's baseline, target job and preferences, for the given current year."""
    return f"""{INSTRUCTIONS}
# User preferences

- Maximum length: {prefs.max_pages} pages
- Tone: {prefs.tone or "no preference"}
- Notes: {prefs.notes or "none"}
- Phone number: {PHONE_INCLUDE if prefs.include_phone else PHONE_EXCLUDE}
- Graduation year: {GRADUATION_INCLUDE if prefs.include_graduation_year else GRADUATION_EXCLUDE}
- Experience (the current year is {year}; place each role by its end year):
{experience_rules(prefs, year)}

# Baseline resume

{baseline or "(not provided)"}

# Job description

{job_description.strip() or "(not provided)"}
"""
