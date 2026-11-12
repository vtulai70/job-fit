#!/usr/bin/env bash
# Stop and remove the JobFit container
set -euo pipefail

docker rm -f jobfit
echo "JobFit stopped"
