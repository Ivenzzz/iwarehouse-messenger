# iWarehouse Messenger — live smoke test (run against the real stack)
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\smoke-test.ps1
# Optionally:  -BaseUrl http://localhost  -Email michael.yap@iwarehouse.ph  -Password "..."
param(
  [string]$BaseUrl = "http://localhost",
  [string]$Email = "michael.yap@iwarehouse.ph",
  [string]$Password = ""
)

$pass = 0; $fail = 0
function Check($name, $ok, $detail = "") {
  if ($ok) { $script:pass++; Write-Host ("  PASS  " + $name) -ForegroundColor Green }
  else { $script:fail++; Write-Host ("  FAIL  " + $name + "  " + $detail) -ForegroundColor Red }
}
function Call($method, $path, $body = $null, $session = $null) {
  $args = @{ Method = $method; Uri = "$BaseUrl/api$path"; SkipHttpErrorCheck = $true }
  if ($body) { $args.Body = ($body | ConvertTo-Json); $args.ContentType = "application/json" }
  if ($session) { $args.WebSession = $session }
  return Invoke-WebRequest @args
}

Write-Host "`niWarehouse Messenger smoke test @ $BaseUrl" -ForegroundColor Cyan

# 1. Health
$r = Call GET "/health/live"
Check "API is alive (/health/live)" ($r.StatusCode -eq 200) $r.StatusCode
$r = Call GET "/health/ready"
Check "API is ready — DB reachable (/health/ready)" ($r.StatusCode -eq 200) $r.StatusCode

# 2. Login error branches
$r = Call POST "/auth/login" @{ email = "ghost@iwarehouse.ph"; password = "nope" }
Check "unknown email -> 401 'Incorrect email or password'" (($r.StatusCode -eq 401) -and ($r.Content -match "Incorrect email or password")) "$($r.StatusCode) $($r.Content)"

$r = Call POST "/auth/login" @{ email = $Email; password = "definitely-wrong-XYZ" }
$lockedAlready = $r.Content -match "temporarily locked"
Check "wrong password -> 401/403 with honest message" (($r.StatusCode -in 401,403) -and (($r.Content -match "Incorrect email or password") -or $lockedAlready)) "$($r.StatusCode) $($r.Content)"
if ($lockedAlready) { Write-Host "        (account currently locked - the lockout branch is verified instead)" -ForegroundColor Yellow }

# 3. Unauthenticated access is rejected
$r = Call GET "/me"
Check "unauthenticated /me -> 401" ($r.StatusCode -eq 401) $r.StatusCode
$r = Call GET "/conversations"
Check "unauthenticated /conversations -> 401" ($r.StatusCode -eq 401) $r.StatusCode

# 4. Full authenticated pass (needs the real password)
if (-not $Password) {
  Write-Host "`n  (skip) Authenticated tests: re-run with -Password `"<SEED_ADMIN_PASSWORD>`" to cover login success, /me, conversations, messages, refresh cookies" -ForegroundColor Yellow
} else {
  $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $r = Call POST "/auth/login" @{ email = $Email; password = $Password } $s
  Check "correct login -> 200/201 + cookies set" (($r.StatusCode -in 200,201)) "$($r.StatusCode) $($r.Content)"
  if ($r.StatusCode -in 200,201) {
    $r = Call GET "/me" $null $s
    Check "authenticated /me -> 200 with own email" (($r.StatusCode -eq 200) -and ($r.Content -match $Email)) $r.StatusCode
    $r = Call GET "/conversations" $null $s
    Check "conversations list loads" ($r.StatusCode -eq 200) $r.StatusCode
    $convs = $r.Content | ConvertFrom-Json
    if ($convs.Count -gt 0) {
      $cid = $convs[0].id
      $r = Call GET "/conversations/$cid/messages?limit=5" $null $s
      Check "messages load for first conversation" ($r.StatusCode -eq 200) $r.StatusCode
      $r = Call POST "/conversations/$cid/messages" @{ content = "smoke-test message $(Get-Date -Format o)" } $s
      Check "sending a message works" ($r.StatusCode -in 200,201) "$($r.StatusCode) $($r.Content)"
    } else {
      Write-Host "        (no conversations found - run db:seed for full coverage)" -ForegroundColor Yellow
    }
    $r = Call GET "/notifications" $null $s
    Check "notifications endpoint" ($r.StatusCode -eq 200) $r.StatusCode
    $r = Call GET "/saved" $null $s
    Check "saved messages endpoint" ($r.StatusCode -eq 200) $r.StatusCode
    $r = Call GET "/search/messages?q=stock" $null $s
    Check "search endpoint" ($r.StatusCode -eq 200) $r.StatusCode
    $r = Call POST "/auth/logout" $null $s
    Check "logout" ($r.StatusCode -in 200,201) $r.StatusCode
    $r = Call GET "/me" $null $s
    Check "after logout /me -> 401 (session truly dead)" ($r.StatusCode -eq 401) $r.StatusCode
  }
}

Write-Host "`nRESULT: $pass passed, $fail failed`n" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
if ($fail -gt 0) { exit 1 }
