# iter-22b - Seed the Design Office hero SKP model cache.
#
# Drops a curated set of SketchUp components into
# %APPDATA%\DesignOffice\sketchup_models - consumed by
# design_office_extensions.rb _place_model Sketchup::Definitions.load.

$ErrorActionPreference = 'Stop'

$CacheDir = Join-Path $env:APPDATA 'DesignOffice\sketchup_models'
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
Write-Host "Cache dir: $CacheDir"

$SketchUpRoots = @(
    'C:\Program Files\SketchUp\SketchUp 2026',
    'C:\Program Files\SketchUp\SketchUp 2025',
    'C:\Program Files\SketchUp\SketchUp 2024'
)

$SketchUpRoot = $SketchUpRoots | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $SketchUpRoot) {
    Write-Warning "SketchUp install not found. Skipping shipped-component copy."
    exit 0
}

Write-Host "SketchUp root: $SketchUpRoot"

$ShippedRoots = @(
    (Join-Path $SketchUpRoot 'ShippedContents\Components'),
    (Join-Path $SketchUpRoot 'Components'),
    (Join-Path $SketchUpRoot 'Shipped Content\Components')
) | Where-Object { Test-Path $_ }

if (-not $ShippedRoots) {
    Write-Warning "No Components folder found under SketchUp root."
    Write-Host "Drop .skp files manually into $CacheDir"
    exit 0
}

Write-Host "Scanning components under:"
$ShippedRoots | ForEach-Object { Write-Host "  $_" }

$SlugKeywords = @{
    'human_standing.skp'             = @('Standing')
    'human_seated.skp'               = @('Sitting')
    'human_walking.skp'              = @('Walking')
    'plant_ficus_lyrata.skp'         = @('Ficus')
    'plant_monstera.skp'             = @('Monstera')
    'plant_pothos.skp'               = @('Pothos')
    'plant_dracaena.skp'             = @('Dracaena')
    'chair_aeron.skp'                = @('Chair')
    'chair_eames.skp'                = @('Armchair')
    'desk_bench_1600.skp'            = @('Desk')
    'table_eames_segmented_4000.skp' = @('Conference')
    'framery_one_compact.skp'        = @('Booth')
    'sofa_hay_mags.skp'              = @('Sofa')
}

$copied = 0
$missing = @()

$allSkp = @()
foreach ($root in $ShippedRoots) {
    $allSkp += Get-ChildItem -Path $root -Filter '*.skp' -Recurse -ErrorAction SilentlyContinue
}
Write-Host "Found $($allSkp.Count) SKP files in shipped content."

foreach ($target in $SlugKeywords.Keys) {
    $dst = Join-Path $CacheDir $target
    if (Test-Path $dst) {
        continue
    }
    $keywords = $SlugKeywords[$target]
    $match = $allSkp | Where-Object {
        $name = $_.Name
        $allMatch = $true
        foreach ($k in $keywords) {
            if ($name -notmatch [regex]::Escape($k)) { $allMatch = $false; break }
        }
        $allMatch
    } | Select-Object -First 1

    if ($match) {
        Copy-Item -Path $match.FullName -Destination $dst -Force
        Write-Host ("  [OK] {0} -- from {1}" -f $target, $match.Name)
        $copied++
    } else {
        $missing += $target
    }
}

Write-Host ""
Write-Host "Copied $copied models to cache."
if ($missing.Count -gt 0) {
    Write-Host "Missing (fallback boxes will be drawn until these are present):"
    $missing | ForEach-Object { Write-Host "  - $_" }
}
