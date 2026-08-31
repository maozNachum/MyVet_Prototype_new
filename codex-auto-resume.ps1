[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath,

    [string]$SessionId,

    [string]$InitialPrompt,

    [string]$ContinuePrompt = "Continue the existing task from exactly where you stopped. Inspect the current repository state and the prior thread context. Do not redo completed work. Continue until the original task is fully complete, and run appropriate tests or verification before finishing.",

    [ValidateRange(10, 3600)]
    [int]$PollSeconds = 180,

    [ValidateRange(0, 600)]
    [int]$ResetBufferSeconds = 30,

    [ValidateRange(30, 720)]
    [int]$UnknownLimitMaxWaitMinutes = 390,

    [bool]$KeepAwake = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 can decode UTF-8 output from native programs incorrectly.
# Force the console and native-command pipeline to UTF-8 before launching Codex.
try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [Console]::InputEncoding = $utf8NoBom
    [Console]::OutputEncoding = $utf8NoBom
    $OutputEncoding = $utf8NoBom
    if ($env:OS -eq "Windows_NT") {
        cmd.exe /d /c "chcp 65001 >nul" | Out-Null
    }
}
catch {
    # Encoding setup is best-effort; Codex can still run if the console rejects it.
}

function Get-OptionalProperty {
    param(
        [object]$Object,
        [string]$Name
    )

    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Convert-UnixSecondsToLocal {
    param([object]$Seconds)

    if ($null -eq $Seconds) { return $null }
    try {
        return [DateTimeOffset]::FromUnixTimeSeconds([int64]$Seconds).ToLocalTime()
    }
    catch {
        return $null
    }
}

# Be defensive about quotes/trailing separators passed by BAT/cmd.exe.
$ProjectPath = $ProjectPath.Trim().Trim('"')
if ($ProjectPath.Length -gt 3) { $ProjectPath = $ProjectPath.TrimEnd('\') }
$resolvedProject = (Resolve-Path -LiteralPath $ProjectPath).Path
$stateDir = Join-Path $resolvedProject ".codex-auto-resume"
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null

$logFile = Join-Path $stateDir "supervisor.log"
$stateFile = Join-Path $stateDir "state.json"
$weeklyStopFile = Join-Path $stateDir "STOPPED_WEEKLY.txt"

# Clear a stop marker from an older run; a new one is written only if this run hits the weekly limit.
if (Test-Path -LiteralPath $weeklyStopFile) {
    Remove-Item -LiteralPath $weeklyStopFile -Force -ErrorAction SilentlyContinue
}

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR")]
        [string]$Level = "INFO"
    )

    $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8

    switch ($Level) {
        "WARN"  { Write-Host $line -ForegroundColor Yellow }
        "ERROR" { Write-Host $line -ForegroundColor Red }
        default { Write-Host $line }
    }
}

function Save-State {
    param(
        [string]$ThreadId,
        [string]$Status
    )

    $state = [ordered]@{
        projectPath = $resolvedProject
        threadId    = $ThreadId
        status      = $Status
        updatedAt   = [DateTimeOffset]::Now.ToString("o")
    }

    $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding UTF8
}

function Enable-KeepAwake {
    if (-not $KeepAwake) { return $false }

    try {
        if (-not ("CodexAutoResume.NativeMethods" -as [type])) {
            Add-Type @"
using System;
using System.Runtime.InteropServices;
namespace CodexAutoResume {
    public static class NativeMethods {
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern uint SetThreadExecutionState(uint esFlags);
    }
}
"@
        }

        # 0x80000001 = ES_CONTINUOUS | ES_SYSTEM_REQUIRED.
        # Parse the final flag as UInt32 in one operation so Windows PowerShell 5.1
        # does not turn 0x80000000 into a negative Int32 during -bor.
        $keepAwakeFlags = [Convert]::ToUInt32("80000001", 16)
        $result = [CodexAutoResume.NativeMethods]::SetThreadExecutionState($keepAwakeFlags)
        if ($result -eq 0) {
            throw "SetThreadExecutionState returned 0."
        }
        Write-Log "Keep-awake enabled. Windows may turn off the display, but the PC should not sleep while this supervisor is running."
        return $true
    }
    catch {
        Write-Log "Could not enable sleep prevention: $($_.Exception.Message)" "WARN"
        return $false
    }
}

function Disable-KeepAwake {
    param([bool]$WasEnabled)

    if (-not $WasEnabled) { return }
    try {
        $continuousOnly = [Convert]::ToUInt32("80000000", 16)
        [void][CodexAutoResume.NativeMethods]::SetThreadExecutionState($continuousOnly)
    }
    catch {
        # Nothing else to do during cleanup.
    }
}

function Read-ProcessJsonResponse {
    param(
        [System.Diagnostics.Process]$Process,
        [int]$ResponseId,
        [int]$TimeoutSeconds = 20
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)

    while ([DateTime]::UtcNow -lt $deadline) {
        $remainingMs = [Math]::Max(100, [int]($deadline.Subtract([DateTime]::UtcNow).TotalMilliseconds))
        $readTask = $Process.StandardOutput.ReadLineAsync()

        if (-not $readTask.Wait($remainingMs)) {
            throw "Timed out waiting for Codex app-server response."
        }

        $line = $readTask.Result
        if ($null -eq $line) {
            break
        }

        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        try {
            $obj = $line | ConvertFrom-Json
            $id = Get-OptionalProperty $obj "id"
            if ($null -ne $id -and [int]$id -eq $ResponseId) {
                return $obj
            }
        }
        catch {
            # Ignore non-JSON diagnostics on stdout and keep reading.
        }
    }

    throw "Codex app-server ended before returning response id $ResponseId."
}

function Get-RateLimitsFromAppServer {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    $psi.Arguments = '/d /s /c "codex app-server"'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi

    try {
        if (-not $process.Start()) {
            throw "Failed to start codex app-server."
        }

        $initialize = @{
            method = "initialize"
            id = 0
            params = @{
                clientInfo = @{
                    name = "codex_auto_resume"
                    title = "Codex Auto Resume"
                    version = "1.0.0"
                }
            }
        } | ConvertTo-Json -Compress -Depth 6

        $initialized = @{
            method = "initialized"
            params = @{}
        } | ConvertTo-Json -Compress -Depth 3

        $rateRequest = @{
            method = "account/rateLimits/read"
            id = 7
            params = @{}
        } | ConvertTo-Json -Compress -Depth 3

        $process.StandardInput.WriteLine($initialize)
        $process.StandardInput.WriteLine($initialized)
        $process.StandardInput.WriteLine($rateRequest)
        $process.StandardInput.Flush()

        $response = Read-ProcessJsonResponse -Process $process -ResponseId 7 -TimeoutSeconds 20
        $errorObject = Get-OptionalProperty $response "error"
        if ($null -ne $errorObject) {
            throw "Codex app-server returned an error: $($errorObject | ConvertTo-Json -Compress -Depth 5)"
        }

        $result = Get-OptionalProperty $response "result"
        $limits = Get-OptionalProperty $result "rateLimits"
        if ($null -eq $limits) {
            throw "Codex app-server returned no rateLimits object."
        }

        $primary = Get-OptionalProperty $limits "primary"
        $secondary = Get-OptionalProperty $limits "secondary"

        return [pscustomobject]@{
            Source = "app-server"
            Primary = if ($null -eq $primary) { $null } else {
                [pscustomobject]@{
                    UsedPercent = Get-OptionalProperty $primary "usedPercent"
                    WindowMinutes = Get-OptionalProperty $primary "windowDurationMins"
                    ResetsAt = Get-OptionalProperty $primary "resetsAt"
                }
            }
            Secondary = if ($null -eq $secondary) { $null } else {
                [pscustomobject]@{
                    UsedPercent = Get-OptionalProperty $secondary "usedPercent"
                    WindowMinutes = Get-OptionalProperty $secondary "windowDurationMins"
                    ResetsAt = Get-OptionalProperty $secondary "resetsAt"
                }
            }
            RateLimitReachedType = Get-OptionalProperty $limits "rateLimitReachedType"
        }
    }
    finally {
        try { $process.StandardInput.Close() } catch {}
        try {
            if (-not $process.HasExited) {
                $process.Kill()
            }
        }
        catch {}
        $process.Dispose()
    }
}

function Get-CodexHome {
    if (-not [string]::IsNullOrWhiteSpace($env:CODEX_HOME)) {
        return $env:CODEX_HOME
    }
    return (Join-Path $HOME ".codex")
}

function Find-RolloutFiles {
    param([string]$ThreadId)

    $sessionsRoot = Join-Path (Get-CodexHome) "sessions"
    if (-not (Test-Path -LiteralPath $sessionsRoot)) {
        return @()
    }

    if (-not [string]::IsNullOrWhiteSpace($ThreadId)) {
        $matching = @(Get-ChildItem -LiteralPath $sessionsRoot -Recurse -File -Filter "*$ThreadId*.jsonl" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending)
        if ($matching.Count -gt 0) {
            return $matching
        }
    }

    return @(Get-ChildItem -LiteralPath $sessionsRoot -Recurse -File -Filter "*.jsonl" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 20)
}

function Get-RateLimitsFromRollout {
    param([string]$ThreadId)

    $files = Find-RolloutFiles -ThreadId $ThreadId
    foreach ($file in $files) {
        try {
            $lines = @(Get-Content -LiteralPath $file.FullName -Tail 2500 -ErrorAction Stop)
            for ($i = $lines.Count - 1; $i -ge 0; $i--) {
                $line = $lines[$i]
                if ([string]::IsNullOrWhiteSpace($line)) { continue }

                try {
                    $obj = $line | ConvertFrom-Json
                }
                catch {
                    continue
                }

                if ((Get-OptionalProperty $obj "type") -ne "event_msg") { continue }
                $payload = Get-OptionalProperty $obj "payload"
                if ((Get-OptionalProperty $payload "type") -ne "token_count") { continue }

                $limits = Get-OptionalProperty $payload "rate_limits"
                if ($null -eq $limits) { continue }

                $primary = Get-OptionalProperty $limits "primary"
                $secondary = Get-OptionalProperty $limits "secondary"

                return [pscustomobject]@{
                    Source = "rollout:$($file.Name)"
                    Primary = if ($null -eq $primary) { $null } else {
                        [pscustomobject]@{
                            UsedPercent = Get-OptionalProperty $primary "used_percent"
                            WindowMinutes = Get-OptionalProperty $primary "window_minutes"
                            ResetsAt = Get-OptionalProperty $primary "resets_at"
                        }
                    }
                    Secondary = if ($null -eq $secondary) { $null } else {
                        [pscustomobject]@{
                            UsedPercent = Get-OptionalProperty $secondary "used_percent"
                            WindowMinutes = Get-OptionalProperty $secondary "window_minutes"
                            ResetsAt = Get-OptionalProperty $secondary "resets_at"
                        }
                    }
                    RateLimitReachedType = Get-OptionalProperty $limits "rate_limit_reached_type"
                }
            }
        }
        catch {
            continue
        }
    }

    return $null
}

function Get-CurrentRateLimits {
    param([string]$ThreadId)

    try {
        return Get-RateLimitsFromAppServer
    }
    catch {
        Write-Log "Live rate-limit query failed; falling back to local Codex rollout data. $($_.Exception.Message)" "WARN"
        return Get-RateLimitsFromRollout -ThreadId $ThreadId
    }
}

function Get-ResetTimeFromErrorText {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }

    $match = [regex]::Match($Text, '(?im)try again at\s+([^\r\n]+)')
    if (-not $match.Success) { return $null }

    $candidate = $match.Groups[1].Value.Trim()
    $candidate = [regex]::Replace($candidate, '(\d+)(st|nd|rd|th)', '$1', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $candidate = $candidate.Trim().TrimEnd('.', ')')

    $parsed = [DateTimeOffset]::MinValue
    if ([DateTimeOffset]::TryParse($candidate, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeLocal, [ref]$parsed)) {
        return $parsed
    }

    if ([DateTimeOffset]::TryParse($candidate, [ref]$parsed)) {
        return $parsed
    }

    return $null
}

function Get-LimitClassification {
    param(
        [object]$Limits,
        [string]$ErrorText
    )

    $primary = if ($null -eq $Limits) { $null } else { $Limits.Primary }
    $secondary = if ($null -eq $Limits) { $null } else { $Limits.Secondary }

    $primaryUsed = if ($null -eq $primary -or $null -eq $primary.UsedPercent) { $null } else { [double]$primary.UsedPercent }
    $secondaryUsed = if ($null -eq $secondary -or $null -eq $secondary.UsedPercent) { $null } else { [double]$secondary.UsedPercent }

    # Weekly wins if both windows are exhausted.
    if ($null -ne $secondaryUsed -and $secondaryUsed -ge 99.5) {
        return "Weekly"
    }

    if ($null -ne $primaryUsed -and $primaryUsed -ge 99.5) {
        return "FiveHour"
    }

    if ($ErrorText -match '(?i)weekly|week[ -]?limit') {
        return "Weekly"
    }

    if ($ErrorText -match '(?i)5[ -]?hour|five[ -]?hour') {
        return "FiveHour"
    }

    # A just-before-failure snapshot can be slightly below 100%.
    if ($null -ne $secondaryUsed -and $secondaryUsed -ge 95.0 -and ($null -eq $primaryUsed -or $secondaryUsed -ge $primaryUsed)) {
        return "Weekly"
    }

    if ($null -ne $primaryUsed -and $primaryUsed -ge 95.0) {
        return "FiveHour"
    }

    # Last fallback: infer by the server-provided "try again" time.
    $errorReset = Get-ResetTimeFromErrorText -Text $ErrorText
    if ($null -ne $errorReset) {
        $hoursAway = ($errorReset - [DateTimeOffset]::Now).TotalHours
        if ($hoursAway -gt 6.5) {
            return "Weekly"
        }
        if ($hoursAway -gt -0.25) {
            return "FiveHour"
        }
    }

    return "Unknown"
}

function Format-LimitWindow {
    param([object]$Window)

    if ($null -eq $Window) { return "n/a" }
    $resetLocal = Convert-UnixSecondsToLocal $Window.ResetsAt
    $resetText = if ($null -eq $resetLocal) { "unknown reset" } else { $resetLocal.ToString("yyyy-MM-dd HH:mm:ss zzz") }
    return "used=$($Window.UsedPercent)% window=$($Window.WindowMinutes)min reset=$resetText"
}

function Wait-ForFiveHourReset {
    param(
        [string]$ThreadId,
        [object]$InitialLimits
    )

    $limits = $InitialLimits
    $startedWaiting = [DateTimeOffset]::Now

    while ($true) {
        if ($null -ne $limits) {
            Write-Log "5-hour window: $(Format-LimitWindow $limits.Primary); weekly: $(Format-LimitWindow $limits.Secondary). Source=$($limits.Source)"

            $classification = Get-LimitClassification -Limits $limits -ErrorText "5-hour limit"
            if ($classification -eq "Weekly") {
                return "Weekly"
            }

            $primary = $limits.Primary
            if ($null -ne $primary) {
                $used = if ($null -eq $primary.UsedPercent) { $null } else { [double]$primary.UsedPercent }
                if ($null -ne $used -and $used -lt 99.5) {
                    Write-Log "The 5-hour window is available again. Resuming Codex."
                    return "Ready"
                }

                $resetAt = Convert-UnixSecondsToLocal $primary.ResetsAt
                if ($null -ne $resetAt -and $resetAt -gt [DateTimeOffset]::Now) {
                    $seconds = [Math]::Ceiling(($resetAt - [DateTimeOffset]::Now).TotalSeconds) + $ResetBufferSeconds
                    $seconds = [Math]::Max(5, [int]$seconds)
                    Write-Log "Sleeping until the Codex-provided 5-hour reset time ($($resetAt.ToString('yyyy-MM-dd HH:mm:ss zzz'))) + $ResetBufferSeconds seconds."
                    Start-Sleep -Seconds $seconds
                }
                else {
                    Write-Log "Reset time is unavailable or already passed; checking again in $PollSeconds seconds."
                    Start-Sleep -Seconds $PollSeconds
                }
            }
            else {
                Start-Sleep -Seconds $PollSeconds
            }
        }
        else {
            $elapsedMinutes = ([DateTimeOffset]::Now - $startedWaiting).TotalMinutes
            if ($elapsedMinutes -ge $UnknownLimitMaxWaitMinutes) {
                Write-Log "Could not read Codex rate-limit state for $([math]::Round($elapsedMinutes)) minutes. Stopping rather than risk polling through a weekly limit." "ERROR"
                return "UnknownStop"
            }

            Write-Log "Rate-limit state is currently unavailable; retrying in $PollSeconds seconds." "WARN"
            Start-Sleep -Seconds $PollSeconds
        }

        $limits = Get-CurrentRateLimits -ThreadId $ThreadId
    }
}

function Invoke-CodexTurn {
    param(
        [ValidateSet("New", "ResumeLast", "ResumeId")]
        [string]$Mode,
        [string]$ThreadId,
        [string]$Prompt
    )

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $stdoutFile = Join-Path $stateDir "codex-$stamp.stdout.jsonl"
    $stderrFile = Join-Path $stateDir "codex-$stamp.stderr.log"

    $argsList = @("exec", "--json", "--skip-git-repo-check", "-C", $resolvedProject)
    switch ($Mode) {
        "ResumeId" {
            $argsList += @("resume", $ThreadId, $Prompt)
        }
        "ResumeLast" {
            $argsList += @("resume", "--last", $Prompt)
        }
        "New" {
            $argsList += @($Prompt)
        }
    }

    Write-Log "Starting Codex mode=$Mode in '$resolvedProject'."

    $seenThreadId = $null
    $turnCompleted = $false
    $turnFailed = $false
    $sawProtocolLimit = $false
    $textBuilder = New-Object System.Text.StringBuilder
    $agentBuilder = New-Object System.Text.StringBuilder

    & codex @argsList 2> $stderrFile | ForEach-Object {
        $line = [string]$_
        Add-Content -LiteralPath $stdoutFile -Value $line -Encoding UTF8
        [void]$textBuilder.AppendLine($line)

        try {
            $obj = $line | ConvertFrom-Json
            $type = Get-OptionalProperty $obj "type"

            if ($type -eq "thread.started") {
                $candidateId = Get-OptionalProperty $obj "thread_id"
                if (-not [string]::IsNullOrWhiteSpace([string]$candidateId)) {
                    $seenThreadId = [string]$candidateId
                    Save-State -ThreadId $seenThreadId -Status "running"
                    Write-Log "Codex thread id: $seenThreadId"
                }
            }
            elseif ($type -eq "item.completed") {
                $item = Get-OptionalProperty $obj "item"
                if ((Get-OptionalProperty $item "type") -eq "agent_message") {
                    $message = [string](Get-OptionalProperty $item "text")
                    if (-not [string]::IsNullOrWhiteSpace($message)) {
                        [void]$agentBuilder.AppendLine($message)
                        Write-Host "`n----- Codex -----"
                        Write-Host $message
                        Write-Host "-----------------`n"
                    }
                }
            }
            elseif ($type -eq "turn.completed") {
                $turnCompleted = $true
            }
            elseif ($type -eq "turn.failed") {
                $turnFailed = $true
            }
            elseif ($type -eq "error") {
                $message = Get-OptionalProperty $obj "message"
                if (-not [string]::IsNullOrWhiteSpace([string]$message)) {
                    if ([string]$message -match '(?i)usage limit|rate limit|limit reached|hit your.*limit|try again at') {
                        $sawProtocolLimit = $true
                    }
                    Write-Log "Codex error: $message" "WARN"
                }
            }
        }
        catch {
            # Keep raw output in the file; do not treat repository-controlled text as protocol.
        }
    }

    $exitCode = $LASTEXITCODE
    $stderrText = ""
    if (Test-Path -LiteralPath $stderrFile) {
        $stderrText = Get-Content -LiteralPath $stderrFile -Raw -ErrorAction SilentlyContinue
    }

    if (-not [string]::IsNullOrWhiteSpace($stderrText)) {
        [void]$textBuilder.AppendLine($stderrText)
    }

    $allText = $textBuilder.ToString()
    $limitTextDetected = $allText -match '(?i)usage limit|rate limit|limit reached|hit your.*limit|try again at'
    $limitDetected = $sawProtocolLimit -or (($exitCode -ne 0 -or $turnFailed) -and $limitTextDetected)

    return [pscustomobject]@{
        ExitCode = $exitCode
        ThreadId = $seenThreadId
        TurnCompleted = $turnCompleted
        TurnFailed = $turnFailed
        LimitDetected = $limitDetected
        Text = $allText
        AgentText = $agentBuilder.ToString()
        StdoutFile = $stdoutFile
        StderrFile = $stderrFile
    }
}

# ---------- Main ----------

$codexCommand = Get-Command codex -ErrorAction SilentlyContinue
if ($null -eq $codexCommand) {
    throw "The 'codex' command was not found in PATH. Install/sign in to Codex CLI first."
}

try {
    $version = (& codex --version 2>$null | Select-Object -First 1)
    Write-Log "Found Codex CLI: $version"
}
catch {
    Write-Log "Codex command exists, but version check failed: $($_.Exception.Message)" "WARN"
}

$awakeEnabled = Enable-KeepAwake
$currentThreadId = $SessionId

# If this supervisor has already managed the project before, prefer its saved
# thread id over a generic `resume --last`. This avoids resuming the wrong chat.
if ([string]::IsNullOrWhiteSpace($currentThreadId) -and (Test-Path -LiteralPath $stateFile)) {
    try {
        $savedState = Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $savedProject = [string](Get-OptionalProperty $savedState "projectPath")
        $savedThread = [string](Get-OptionalProperty $savedState "threadId")
        if (-not [string]::IsNullOrWhiteSpace($savedThread) -and $savedProject -eq $resolvedProject) {
            $currentThreadId = $savedThread
            Write-Log "Using saved Codex thread id: $currentThreadId"
        }
    }
    catch {
        Write-Log "Could not read the saved supervisor state; falling back to Codex resume --last." "WARN"
    }
}

$firstInvocation = $true
$cycle = 0

try {
    while ($true) {
        $cycle++

        if (-not [string]::IsNullOrWhiteSpace($currentThreadId)) {
            $mode = "ResumeId"
            $prompt = $ContinuePrompt
        }
        elseif ($firstInvocation -and -not [string]::IsNullOrWhiteSpace($InitialPrompt)) {
            $mode = "New"
            $prompt = $InitialPrompt
        }
        else {
            $mode = "ResumeLast"
            $prompt = $ContinuePrompt
        }

        $result = Invoke-CodexTurn -Mode $mode -ThreadId $currentThreadId -Prompt $prompt
        $firstInvocation = $false

        if (-not [string]::IsNullOrWhiteSpace($result.ThreadId)) {
            $currentThreadId = $result.ThreadId
        }

        if ($result.LimitDetected) {
            Save-State -ThreadId $currentThreadId -Status "limit-reached"
            Write-Log "Codex reported a usage/rate limit. Determining which window is exhausted."

            $limits = Get-CurrentRateLimits -ThreadId $currentThreadId
            if ($null -ne $limits) {
                Write-Log "Current limits: primary($(Format-LimitWindow $limits.Primary)); secondary($(Format-LimitWindow $limits.Secondary)); source=$($limits.Source)"
            }

            $classification = Get-LimitClassification -Limits $limits -ErrorText $result.Text

            if ($classification -eq "Weekly") {
                $weeklyReset = if ($null -ne $limits -and $null -ne $limits.Secondary) { Convert-UnixSecondsToLocal $limits.Secondary.ResetsAt } else { $null }
                $resetDescription = if ($null -eq $weeklyReset) { "unknown" } else { $weeklyReset.ToString("yyyy-MM-dd HH:mm:ss zzz") }
                $message = "Weekly Codex quota detected. Supervisor stopped intentionally. Weekly reset: $resetDescription. Thread: $currentThreadId"
                Set-Content -LiteralPath $weeklyStopFile -Value $message -Encoding UTF8
                Save-State -ThreadId $currentThreadId -Status "stopped-weekly"
                Write-Log $message "WARN"
                break
            }

            if ($classification -eq "FiveHour") {
                Save-State -ThreadId $currentThreadId -Status "waiting-5h-reset"
                $waitResult = Wait-ForFiveHourReset -ThreadId $currentThreadId -InitialLimits $limits

                if ($waitResult -eq "Weekly") {
                    $message = "Weekly Codex quota became exhausted while waiting for the 5-hour window. Supervisor stopped intentionally. Thread: $currentThreadId"
                    Set-Content -LiteralPath $weeklyStopFile -Value $message -Encoding UTF8
                    Save-State -ThreadId $currentThreadId -Status "stopped-weekly"
                    Write-Log $message "WARN"
                    break
                }

                if ($waitResult -ne "Ready") {
                    Save-State -ThreadId $currentThreadId -Status "stopped-unknown-limit"
                    break
                }

                Save-State -ThreadId $currentThreadId -Status "resuming-after-5h-reset"
                continue
            }

            # Unknown limit: do not run indefinitely. Prefer safety over hammering the service.
            Write-Log "Could not confidently distinguish the 5-hour limit from the weekly limit. Will re-check for up to $UnknownLimitMaxWaitMinutes minutes, then stop if still unknown." "WARN"
            $unknownStart = [DateTimeOffset]::Now
            $resolved = $false

            while (([DateTimeOffset]::Now - $unknownStart).TotalMinutes -lt $UnknownLimitMaxWaitMinutes) {
                Start-Sleep -Seconds $PollSeconds
                $limits = Get-CurrentRateLimits -ThreadId $currentThreadId
                $classification = Get-LimitClassification -Limits $limits -ErrorText $result.Text

                if ($classification -eq "Weekly") {
                    $message = "Weekly Codex quota detected during fallback checks. Supervisor stopped intentionally. Thread: $currentThreadId"
                    Set-Content -LiteralPath $weeklyStopFile -Value $message -Encoding UTF8
                    Save-State -ThreadId $currentThreadId -Status "stopped-weekly"
                    Write-Log $message "WARN"
                    $resolved = $true
                    break
                }

                if ($classification -eq "FiveHour") {
                    $waitResult = Wait-ForFiveHourReset -ThreadId $currentThreadId -InitialLimits $limits
                    if ($waitResult -eq "Ready") {
                        $resolved = $true
                        break
                    }
                    if ($waitResult -eq "Weekly") {
                        $message = "Weekly Codex quota detected while resolving an unknown limit. Supervisor stopped intentionally. Thread: $currentThreadId"
                        Set-Content -LiteralPath $weeklyStopFile -Value $message -Encoding UTF8
                        Save-State -ThreadId $currentThreadId -Status "stopped-weekly"
                        Write-Log $message "WARN"
                        $resolved = $true
                        break
                    }
                }
            }

            if ($resolved -and (Test-Path -LiteralPath $weeklyStopFile)) {
                break
            }

            if ($resolved) {
                continue
            }

            Save-State -ThreadId $currentThreadId -Status "stopped-unknown-limit"
            Write-Log "Limit type remained unknown. Supervisor stopped to avoid running through a weekly quota." "ERROR"
            break
        }

        if ($result.ExitCode -eq 0 -and $result.TurnCompleted) {
            Save-State -ThreadId $currentThreadId -Status "completed"
            Write-Log "Codex turn completed without a usage limit. Supervisor finished normally."
            break
        }

        if ($result.Text -match '(?i)active writer|thread-store conflict|already has an active writer') {
            Save-State -ThreadId $currentThreadId -Status "stopped-thread-in-use"
            Write-Log "This Codex thread is still open in another Codex window/process. Close Codex in the app/IDE/other terminal, then run Start-Codex-Auto-Resume.bat again." "ERROR"
            break
        }

        Save-State -ThreadId $currentThreadId -Status "stopped-error"
        Write-Log "Codex stopped for a non-limit error (exit code $($result.ExitCode)). Details were saved to: $($result.StderrFile)" "ERROR"
        break
    }
}
finally {
    Disable-KeepAwake -WasEnabled $awakeEnabled
}
