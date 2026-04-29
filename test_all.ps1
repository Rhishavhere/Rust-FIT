#!/usr/bin/env pwsh
# FIT CLI — Full integration test script
# Runs every subcommand, checks exit codes, and reports results.
# Usage: powershell -ExecutionPolicy Bypass -File test_all.ps1

$ErrorActionPreference = "Continue"
$pass = 0
$fail = 0
$results = @()

function Test-Step {
    param(
        [string]$Name,
        [string]$Cmd
    )
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "TEST: $Name" -ForegroundColor Cyan
    Write-Host "CMD : $Cmd" -ForegroundColor DarkGray
    Write-Host "========================================" -ForegroundColor Cyan

    Invoke-Expression $Cmd 2>&1 | ForEach-Object { Write-Host $_ }
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Host "PASS (exit $exitCode)" -ForegroundColor Green
        $script:pass++
        $script:results += @{ Name = $Name; Status = "PASS" }
    } else {
        Write-Host "FAIL (exit $exitCode)" -ForegroundColor Red
        $script:fail++
        $script:results += @{ Name = $Name; Status = "FAIL" }
    }
    return $exitCode
}

# --- Setup ---
$testDir = ".\tmp\test_run"
if (Test-Path $testDir) { Remove-Item -Recurse -Force $testDir }
New-Item -ItemType Directory -Force -Path $testDir | Out-Null
Write-Host "Test output dir: $testDir`n" -ForegroundColor Yellow

# --- 1. Build ---
Test-Step "cargo check --workspace" "cargo check --workspace"

# --- 2. Generate FIT (priya persona — also writes keys) ---
Test-Step "generate FIT (priya)" `
    "cargo run -p fit-cli -- generate --persona priya -o `"$testDir\priya.fit`" -k `"$testDir\priya.keys.json`""

# --- 3. Inspect ---
Test-Step "inspect FIT" `
    "cargo run -p fit-cli -- inspect `"$testDir\priya.fit`""

# --- 4. Verify ---
Test-Step "verify FIT" `
    "cargo run -p fit-cli -- verify `"$testDir\priya.fit`""

# --- 5. Open (decrypt layers) ---
Test-Step "open FIT (decrypt)" `
    "cargo run -p fit-cli -- open `"$testDir\priya.fit`" -k `"$testDir\priya.keys.json`""

# --- 6. Apply-delta using --patch-file (avoids all PowerShell quoting issues) ---
$patchFile = "$testDir\patch.json"
Set-Content -Path $patchFile -Value '[{"op":"replace","path":"/cibil_score","value":762}]' -NoNewline
Test-Step "apply-delta (CIBIL via --patch-file)" `
    "cargo run -p fit-cli -- apply-delta `"$testDir\priya.fit`" -k `"$testDir\priya.keys.json`" --layer 2 --summary `"CIBIL refresh 752->762`" --patch-file `"$patchFile`" --attester cibil"

# --- 7. Verify after delta ---
Test-Step "verify FIT (post-delta)" `
    "cargo run -p fit-cli -- verify `"$testDir\priya.fit`""

# --- 8. Open after delta (check cibil_score updated) ---
Test-Step "open FIT (post-delta)" `
    "cargo run -p fit-cli -- open `"$testDir\priya.fit`" -k `"$testDir\priya.keys.json`""

# --- 9. Keygen (recipient) + capture X25519 pubkey ---
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: keygen (rajiv recipient)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
$keygenOut = cargo run -p fit-cli -- keygen -o "$testDir\rajiv.keys.json" 2>&1
$keygenOut | ForEach-Object { Write-Host $_ }
$recipientPub = ""
foreach ($line in $keygenOut) {
    if ($line -match "X25519 pubkey\s*:\s*([0-9a-f]+)") {
        $recipientPub = $Matches[1]
    }
}
if ($LASTEXITCODE -eq 0) {
    Write-Host "PASS (exit 0)" -ForegroundColor Green
    $pass++
    $results += @{ Name = "keygen (rajiv)"; Status = "PASS" }
} else {
    Write-Host "FAIL (exit $LASTEXITCODE)" -ForegroundColor Red
    $fail++
    $results += @{ Name = "keygen (rajiv)"; Status = "FAIL" }
}
Write-Host "Recipient X25519 pubkey: $recipientPub" -ForegroundColor DarkGray

# --- 10. Share ---
if ($recipientPub) {
    Test-Step "share FIT (layers 2,3)" `
        "cargo run -p fit-cli -- share `"$testDir\priya.fit`" -k `"$testDir\priya.keys.json`" --layers `"2,3`" --recipient `"$recipientPub`" --expires-days 30 --live-tracking true -o `"$testDir\priya_23.fitshare`""

    # Verify share file was written
    if (Test-Path "$testDir\priya_23.fitshare") {
        $shareSize = (Get-Item "$testDir\priya_23.fitshare").Length
        Write-Host "Share file size: $shareSize bytes" -ForegroundColor DarkGray
    }
} else {
    Write-Host "SKIP: share — could not determine recipient pubkey" -ForegroundColor Yellow
    $results += @{ Name = "share FIT"; Status = "SKIP" }
}

# --- 11. Share with --live-tracking as flag only (no value) ---
if ($recipientPub) {
    Test-Step "share FIT (--live-tracking as flag)" `
        "cargo run -p fit-cli -- share `"$testDir\priya.fit`" -k `"$testDir\priya.keys.json`" --layers `"2,3`" --recipient `"$recipientPub`" --expires-days 30 --live-tracking -o `"$testDir\priya_flag.fitshare`""
}

# --- 12. Relay server (quick start/stop test) ---
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: relay server (start + auto-stop)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
$relayJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    & .\venv\Scripts\python.exe .\fit-relay\relay_server.py 2>&1
}
Start-Sleep -Seconds 3
$relayOut = Receive-Job -Job $relayJob 2>&1 | Out-String
Stop-Job -Job $relayJob -ErrorAction SilentlyContinue
Remove-Job -Job $relayJob -ErrorAction SilentlyContinue

if ($relayOut -match "server listening") {
    Write-Host "PASS — relay started on ws://127.0.0.1:8765" -ForegroundColor Green
    $pass++
    $results += @{ Name = "relay server"; Status = "PASS" }
} else {
    Write-Host "FAIL — relay did not start" -ForegroundColor Red
    Write-Host $relayOut
    $fail++
    $results += @{ Name = "relay server"; Status = "FAIL" }
}

# --- Summary ---
Write-Host "`n`n========================================" -ForegroundColor Magenta
Write-Host "         FINAL RESULTS" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
foreach ($r in $results) {
    $color = if ($r.Status -eq "PASS") { "Green" } elseif ($r.Status -eq "FAIL") { "Red" } else { "Yellow" }
    Write-Host ("  [{0}] {1}" -f $r.Status, $r.Name) -ForegroundColor $color
}
Write-Host "`nPassed: $pass  |  Failed: $fail" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "========================================`n" -ForegroundColor Magenta

if ($fail -gt 0) { exit 1 } else { exit 0 }
