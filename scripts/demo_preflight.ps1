# scripts/demo_preflight.ps1 -- Design Office demo-day pre-flight check
#
# Verifies that every piece Saad relies on for the 3-minute video is in
# place BEFORE he hits Record. Runs against the already-started dev stack
# (run_dev.ps1 must have launched backend on :8000 and frontend on :5173).
#
# Usage :
#   # In one terminal :
#   .\scripts\run_dev.ps1
#   # In another :
#   .\scripts\demo_preflight.ps1
#
# Exit code 0 if everything passes, non-zero otherwise.

param(
    [string]$BackendUrl = "http://127.0.0.1:8000",
    [string]$FrontendUrl = "http://127.0.0.1:5173"
)

$ErrorActionPreference = "Continue"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$script:pass = @()
$script:warn = @()
$script:fail = @()

function Report-Pass {
    param([string]$msg)
    $script:pass += $msg
    Write-Host "  OK   " -ForegroundColor Green -NoNewline
    Write-Host $msg
}
function Report-Warn {
    param([string]$msg)
    $script:warn += $msg
    Write-Host "  WARN " -ForegroundColor Yellow -NoNewline
    Write-Host $msg
}
function Report-Fail {
    param([string]$msg)
    $script:fail += $msg
    Write-Host "  FAIL " -ForegroundColor Red -NoNewline
    Write-Host $msg
}

Write-Host ""
Write-Host "Design Office demo preflight" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
Write-Host ""

# -----------------------------------------------------------------------
# 1. Repo-level artefacts
# -----------------------------------------------------------------------
Write-Host "[1/5] Repo artefacts" -ForegroundColor Cyan

$fixtures = @(
    "backend\tests\fixtures\generate_output_sample.json",
    "backend\tests\fixtures\justify_output_sample.json",
    "backend\tests\fixtures\lumen_justify_pitch_deck.pptx",
    "backend\tests\fixtures\lumen_export_atelier.dxf",
    "backend\tests\fixtures\sketchup_variant_villageois.png",
    "backend\tests\fixtures\sketchup_variant_atelier.png",
    "backend\tests\fixtures\sketchup_variant_hybride_flex.png",
    "backend\tests\fixtures\sketchup_variant_villageois_iso_ne.png",
    "backend\tests\fixtures\sketchup_variant_atelier_iso_ne.png",
    "backend\tests\fixtures\sketchup_variant_hybride_flex_iso_ne.png",
    "backend\tests\fixtures\sketchup_variant_villageois_eye_level.png",
    "backend\tests\fixtures\sketchup_variant_atelier_eye_level.png",
    "backend\tests\fixtures\sketchup_variant_hybride_flex_eye_level.png",
    "docs\screenshots\01-landing.png",
    "docs\screenshots\02-brief.png",
    "docs\screenshots\03-testfit.png",
    "docs\screenshots\04-justify.png",
    "docs\screenshots\05-export.png"
)
foreach ($rel in $fixtures) {
    $p = Join-Path $repoRoot $rel
    if (Test-Path $p) {
        $size = (Get-Item $p).Length
        $sizeStr = "{0:n0}" -f $size
        Report-Pass "$rel  ($sizeStr bytes)"
    } else {
        Report-Fail "$rel  MISSING"
    }
}

# -----------------------------------------------------------------------
# 2. Backend health + live Opus key
# -----------------------------------------------------------------------
Write-Host ""
Write-Host "[2/5] Backend health" -ForegroundColor Cyan

try {
    $health = Invoke-RestMethod -Uri "$BackendUrl/health" -TimeoutSec 5
    if ($health.status -eq "ok") {
        Report-Pass "backend /health  status=$($health.status) model=$($health.model)"
    } else {
        Report-Fail "backend /health  status=$($health.status)"
    }
    if ($health.api_key_loaded) {
        Report-Pass "Anthropic API key loaded"
    } else {
        Report-Warn ".env ANTHROPIC_API_KEY not loaded - Opus calls will fail during the demo"
    }
} catch {
    Report-Fail "backend /health  UNREACHABLE at $BackendUrl  ($($_.Exception.Message))"
}

# -----------------------------------------------------------------------
# 3. Each HTTP surface responds sanely
# -----------------------------------------------------------------------
Write-Host ""
Write-Host "[3/5] HTTP surfaces" -ForegroundColor Cyan

$endpoints = @(
    @{ url = "$BackendUrl/api/integrations/status"; probe = "anthropic.api_key_loaded"; label = "integrations status" },
    @{ url = "$BackendUrl/api/brief/manifest"      ; probe = "files"                  ; label = "brief manifest" },
    @{ url = "$BackendUrl/api/testfit/catalog"     ; probe = "count"                  ; label = "testfit catalog" },
    @{ url = "$BackendUrl/api/testfit/fixture?use_vision=false"; probe = "envelope"   ; label = "testfit Lumen fixture" }
)
foreach ($e in $endpoints) {
    try {
        $resp = Invoke-RestMethod -Uri $e.url -TimeoutSec 10
        $probe = $e.probe.Split(".")
        $val = $resp
        foreach ($seg in $probe) { $val = $val.$seg }
        if ($null -ne $val) {
            $valStr = if ($val -is [System.Collections.IEnumerable] -and -not ($val -is [string])) { "array(len=$(($val | Measure-Object).Count))" } else { "$val" }
            Report-Pass "$($e.label)  $($e.probe)=$valStr"
        } else {
            Report-Warn "$($e.label)  probe $($e.probe) returned null"
        }
    } catch {
        Report-Fail "$($e.label)  $($e.url)  ($($_.Exception.Message))"
    }
}

# -----------------------------------------------------------------------
# 4. Frontend reachable + renders the shell
# -----------------------------------------------------------------------
Write-Host ""
Write-Host "[4/5] Frontend" -ForegroundColor Cyan

try {
    $html = Invoke-WebRequest -Uri "$FrontendUrl/" -TimeoutSec 8 -UseBasicParsing
    if ($html.StatusCode -eq 200 -and $html.Content -match "Design Office") {
        $sizeStr = "{0:n0}" -f $html.Content.Length
        Report-Pass "frontend /  HTTP 200  ($sizeStr bytes)"
    } else {
        Report-Fail "frontend /  HTTP $($html.StatusCode)"
    }
} catch {
    Report-Fail "frontend /  UNREACHABLE at $FrontendUrl  ($($_.Exception.Message))"
}

# -----------------------------------------------------------------------
# 5. SketchUp MCP live probe (soft - mock backend is a valid fallback)
# -----------------------------------------------------------------------
Write-Host ""
Write-Host "[5/5] SketchUp MCP" -ForegroundColor Cyan

try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.ReceiveTimeout = 1000
    $tcp.SendTimeout = 1000
    $tcp.Connect("127.0.0.1", 9876)
    if ($tcp.Connected) {
        Report-Pass "SketchUp MCP listening on 127.0.0.1:9876 - demo will use live renders"
        $tcp.Close()
    } else {
        Report-Warn "SketchUp MCP not reachable - demo will use bundled iso screenshots (acceptable fallback)"
    }
} catch {
    Report-Warn "SketchUp MCP not reachable on 127.0.0.1:9876 - demo will use bundled iso screenshots (acceptable fallback)"
}

# -----------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------
Write-Host ""
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "-------" -ForegroundColor Cyan
Write-Host "  $($script:pass.Count) pass" -ForegroundColor Green
Write-Host "  $($script:warn.Count) warn" -ForegroundColor Yellow
Write-Host "  $($script:fail.Count) fail" -ForegroundColor Red
Write-Host ""

if ($script:fail.Count -gt 0) {
    Write-Host "NOT READY for demo recording - resolve the failures above." -ForegroundColor Red
    exit 1
} elseif ($script:warn.Count -gt 0) {
    Write-Host "READY with warnings - review them, then record." -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "READY - every surface is green. Hit Record." -ForegroundColor Green
    exit 0
}
