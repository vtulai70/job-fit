#!/usr/bin/env bash
# Build the JobFit image and run it on http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p data
set -a; source .env; set +a
docker build --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY -t jobfit .
docker rm -f jobfit >/dev/null 2>&1 || true
docker run -d --name jobfit --env-file .env -p 8000:8000 -v "$(pwd)/data:/app/data" jobfit
echo "JobFit running at http://localhost:8000"
