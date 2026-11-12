# The Resume Customizer MVP web app

## Business Requirements

This project is for building a resume customizer App, which allows the user to customize a baseline resume for a specific job description. The app name is JobFit. Key features:
- A user can sign in
- When signed in, the user can upload or update the baseline resume, link the job description, generate the custom resume, and optionally download this as PDF
- The baseline resume is persisted so next time the user logs in the baseline is already available
- The custom resumes are persisted when downloaded. The company and download timestamp are also persisted.
- The user has an option to see the custom resume history, and be able to re-download the PDF for any of these
- There is an AI chat feature in a sidebar; the AI is able to ask clarifying questions before generating the final custom resume

## Limitations

For the MVP, there will only be a user sign in (hardcoded to 'user' and 'password') but the database will support multiple users for future.

For the MVP, this will run locally (in a docker container)

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls. An OPENROUTER_API_KEY is in .env in the project root
- Use `openai/gpt-oss-120b` as the model
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Color Scheme

- Background: `#090D16` - Deep obsidian canvas for immersive dark mode
- Surface / Card: `#111827` (Gray 900) - Layered sidebars and card containers
- Primary / Action: `#38BDF81 (Sky 400) or`#F59E0B` (Amber 500) - High-visibility interactive elements and links
- Text Primary:`#F1F5F9` (Slate 100) - Crisp, legible text against dark surfaces
- Border / Divider: `#1E293B` (Slate 800) - Low-profile structural lines

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.