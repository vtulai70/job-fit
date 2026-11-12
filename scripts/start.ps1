# Build the JobFit image and run it on http://localhost:8000
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

New-Item -ItemType Directory -Force -Path data | Out-Null
$key = (Select-String -Path .env -Pattern '^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=(.*)$').Matches[0].Groups[1].Value
docker build --build-arg "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$key" -t jobfit .
docker rm -f jobfit 2>$null
docker run -d --name jobfit --env-file .env -p 8000:8000 -v "${PWD}/data:/app/data" jobfit
Write-Output "JobFit running at http://localhost:8000"
