# scripts/run_dev.ps1 — Design Office dev launcher (Windows PowerShell)
# Usage: from repo root, run `.\scripts\run_dev.ps1`
# Stops both processes on Ctrl+C.

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$envPath = Join-Path $repoRoot ".env"

if (-not (Test-Path $envPath)) {
    Write-Warning "No .env at $envPath — copy .env.example and fill in the API key."
}

$backendVenv = Join-Path $backendDir ".venv\Scripts\python.exe"
if (-not (Test-Path $backendVenv)) {
    Write-Host "Creating backend venv..." -ForegroundColor Cyan
    & python -m venv (Join-Path $backendDir ".venv")
    & $backendVenv -m pip install --upgrade pip
    & $backendVenv -m pip install -e "$backendDir[dev]"
}

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "Installing frontend deps..." -ForegroundColor Cyan
    Push-Location $frontendDir
    npm install --no-audit --no-fund
    Pop-Location
}

Write-Host ""
Write-Host "Starting backend on http://127.0.0.1:8000 and frontend on http://localhost:5173" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop both." -ForegroundColor Green
Write-Host ""

$backendJob = Start-Job -Name "design-office-backend" -ScriptBlock {
    param($pythonExe, $backendDir)
    Set-Location $backendDir
    & $pythonExe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
} -ArgumentList $backendVenv, $backendDir

$frontendJob = Start-Job -Name "design-office-frontend" -ScriptBlock {
    param($frontendDir)
    Set-Location $frontendDir
    npm run dev
} -ArgumentList $frontendDir

try {
    while ($true) {
        Receive-Job -Job $backendJob
        Receive-Job -Job $frontendJob
        Start-Sleep -Milliseconds 500
    }
}
finally {
    Write-Host "`nStopping jobs..." -ForegroundColor Yellow
    Stop-Job -Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $backendJob, $frontendJob -Force -ErrorAction SilentlyContinue
}
