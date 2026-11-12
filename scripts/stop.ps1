# Stop and remove the JobFit container
$ErrorActionPreference = "Stop"

docker rm -f jobfit
Write-Output "JobFit stopped"
