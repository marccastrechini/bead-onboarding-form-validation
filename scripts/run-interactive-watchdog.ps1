[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$Concepts,

  [ValidateRange(1, 3600)]
  [int]$TimeoutSeconds = 240,

  [ValidateRange(1, 300)]
  [int]$PollSeconds = 15,

  [ValidateNotNullOrEmpty()]
  [string]$SampleEnrichmentPath = 'artifacts/sample-field-enrichment.json',

  [ValidateNotNullOrEmpty()]
  [string]$ChildFilePath = 'npm.cmd',

  [string]$ChildArgumentList = 'run bootstrap:interactive',

  [ValidateNotNullOrEmpty()]
  [string]$ArtifactsDir = 'artifacts'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repoRoot = Split-Path -Parent $PSScriptRoot
$artifactsPath = if ([System.IO.Path]::IsPathRooted($ArtifactsDir)) {
  $ArtifactsDir
} else {
  Join-Path $repoRoot $ArtifactsDir
}

$progressArtifactPath = Join-Path $artifactsPath 'latest-interactive-progress.json'
$innerTimeoutArtifactPath = Join-Path $artifactsPath 'latest-interactive-timeout.json'
$operatorTimeoutArtifactPath = Join-Path $artifactsPath 'latest-interactive-operator-timeout.json'
$startTime = Get-Date
$childProcess = $null
$exitCode = 1
$exitReason = 'wrapper initialization failed'

$interactiveEnv = [ordered]@{
  INTERACTIVE_VALIDATION = '1'
  DISPOSABLE_ENVELOPE = '1'
  BEAD_SAMPLE_ENRICHMENT = '1'
  BEAD_SAMPLE_ENRICHMENT_PATH = $SampleEnrichmentPath
  INTERACTIVE_CONCEPTS = $Concepts
  INTERACTIVE_RUN_TIMEOUT_MS = [string]($TimeoutSeconds * 1000)
}

$interactiveEnvKeys = @($interactiveEnv.Keys)

function Write-OperatorMessage {
  param([string]$Message)

  Write-Host "[interactive:watchdog] $Message"
}

function Get-ElapsedSeconds {
  return [int][Math]::Floor(((Get-Date) - $startTime).TotalSeconds)
}

function Format-HeartbeatField {
  param(
    [AllowNull()]$Value,
    [string]$Fallback = 'n/a'
  )

  if ($null -eq $Value) {
    return $Fallback
  }

  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) {
    return $Fallback
  }

  return $text
}

function Get-ArtifactTimestamp {
  param([string]$Path)

  $item = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
  if ($null -eq $item) {
    return $null
  }

  return $item.LastWriteTimeUtc.ToString('o')
}

function Get-ProgressSummary {
  $timestamp = Get-ArtifactTimestamp -Path $progressArtifactPath
  if (-not $timestamp) {
    return $null
  }

  try {
    $artifact = Get-Content -LiteralPath $progressArtifactPath -Raw | ConvertFrom-Json
  } catch {
    return [pscustomobject]@{
      timestamp = $timestamp
      status = 'unreadable'
      concept = $null
      validationId = $null
      caseName = $null
      phase = $null
    }
  }

  return [pscustomobject]@{
    timestamp = $timestamp
    status = $artifact.status
    concept = $artifact.concept
    validationId = $artifact.validationId
    caseName = $artifact.caseName
    phase = $artifact.phase
  }
}

function Set-InteractiveEnvironment {
  foreach ($entry in $interactiveEnv.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
  }
}

function Clear-InteractiveEnvironment {
  foreach ($key in $interactiveEnvKeys) {
    [Environment]::SetEnvironmentVariable($key, $null, 'Process')
  }

  Write-OperatorMessage ('environment cleanup complete keys=' + ($interactiveEnvKeys -join ','))
}

function Stop-ProcessTree {
  param([int]$ProcessId)

  if ($ProcessId -le 0) {
    return
  }

  Write-OperatorMessage "terminating child process tree pid=$ProcessId via taskkill /pid $ProcessId /t /f"
  try {
    & taskkill.exe /pid $ProcessId /t /f *> $null
  } catch {
    Write-OperatorMessage "taskkill warning pid=$ProcessId"
  }
}

function Write-Heartbeat {
  if ($null -eq $childProcess) {
    return
  }

  $childProcess.Refresh()
  $progress = Get-ProgressSummary
  $timeoutArtifactAt = Get-ArtifactTimestamp -Path $innerTimeoutArtifactPath
  $running = if ($childProcess.HasExited) { 'false' } else { 'true' }
  $progressTimestamp = if ($null -eq $progress) { $null } else { $progress.timestamp }
  $progressConcept = if ($null -eq $progress) { $null } else { $progress.concept }
  $progressValidationId = if ($null -eq $progress) { $null } else { $progress.validationId }
  $progressCaseName = if ($null -eq $progress) { $null } else { $progress.caseName }
  $progressPhase = if ($null -eq $progress) { $null } else { $progress.phase }

  $fields = @(
    "elapsed=$(Get-ElapsedSeconds)s"
    "pid=$($childProcess.Id)"
    "running=$running"
    "progressAt=$(Format-HeartbeatField -Value $progressTimestamp -Fallback 'none')"
    "concept=$(Format-HeartbeatField -Value $progressConcept)"
    "validationId=$(Format-HeartbeatField -Value $progressValidationId)"
    "caseName=$(Format-HeartbeatField -Value $progressCaseName)"
    "phase=$(Format-HeartbeatField -Value $progressPhase)"
    "timeoutArtifactAt=$(Format-HeartbeatField -Value $timeoutArtifactAt -Fallback 'none')"
  )

  Write-OperatorMessage ('heartbeat ' + ($fields -join ' '))
}

function Write-OperatorTimeoutArtifact {
  param([int]$ElapsedSeconds)

  $progress = Get-ProgressSummary
  $timeoutArtifact = [ordered]@{
    schemaVersion = 1
    timestamp = (Get-Date).ToUniversalTime().ToString('o')
    reason = "operator timeout after ${ElapsedSeconds}s"
    concepts = @($Concepts -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    timeoutSeconds = $TimeoutSeconds
    elapsedSeconds = $ElapsedSeconds
    childProcessId = if ($null -eq $childProcess) { $null } else { $childProcess.Id }
    lastProgress = if ($null -eq $progress) {
      $null
    } else {
      [ordered]@{
        timestamp = $progress.timestamp
        status = $progress.status
        concept = $progress.concept
        validationId = $progress.validationId
        caseName = $progress.caseName
        phase = $progress.phase
      }
    }
    latestInnerTimeoutArtifactAt = Get-ArtifactTimestamp -Path $innerTimeoutArtifactPath
  }

  New-Item -ItemType Directory -Path $artifactsPath -Force | Out-Null
  $json = $timeoutArtifact | ConvertTo-Json -Depth 6
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($operatorTimeoutArtifactPath, $json, $utf8NoBom)
  return $operatorTimeoutArtifactPath
}

try {
  New-Item -ItemType Directory -Path $artifactsPath -Force | Out-Null
  Set-InteractiveEnvironment

  Write-OperatorMessage "starting concepts=$Concepts timeoutSeconds=$TimeoutSeconds pollSeconds=$PollSeconds child=$ChildFilePath $ChildArgumentList"
  $childProcess = Start-Process `
    -FilePath $ChildFilePath `
    -ArgumentList $ChildArgumentList `
    -WorkingDirectory $repoRoot `
    -PassThru `
    -NoNewWindow

  Write-OperatorMessage "spawned pid=$($childProcess.Id)"
  Write-Heartbeat

  while (-not $childProcess.HasExited) {
    $elapsedSeconds = Get-ElapsedSeconds
    if ($elapsedSeconds -ge $TimeoutSeconds) {
      break
    }

    $remainingSeconds = $TimeoutSeconds - $elapsedSeconds
    $sleepSeconds = [Math]::Min($PollSeconds, [Math]::Max(1, $remainingSeconds))
    Start-Sleep -Seconds $sleepSeconds
    $childProcess.Refresh()

    if (-not $childProcess.HasExited) {
      Write-Heartbeat
    }
  }

  $childProcess.Refresh()
  if ($childProcess.HasExited) {
    $childProcess.WaitForExit()
    $exitCode = [int]$childProcess.ExitCode
    $exitReason = "child exited with code $exitCode"
    Write-OperatorMessage $exitReason
  } else {
    $elapsedSeconds = Get-ElapsedSeconds
    $timeoutPath = Write-OperatorTimeoutArtifact -ElapsedSeconds $elapsedSeconds
    $exitCode = 124
    $exitReason = "operator timeout after ${elapsedSeconds}s; child pid=$($childProcess.Id); timeoutArtifact=$timeoutPath"
    Write-OperatorMessage $exitReason
    Stop-ProcessTree -ProcessId $childProcess.Id
    try {
      [void]$childProcess.WaitForExit(5000)
    } catch {
      # Best effort after taskkill.
    }
  }
} catch [System.Management.Automation.PipelineStoppedException] {
  $exitCode = 130
  $exitReason = 'operator cancellation detected; terminating child process tree'
  Write-OperatorMessage $exitReason
  if ($null -ne $childProcess -and -not $childProcess.HasExited) {
    Stop-ProcessTree -ProcessId $childProcess.Id
  }
} catch {
  $exitCode = 1
  $exitReason = 'wrapper failure: ' + $_.Exception.Message
  Write-OperatorMessage $exitReason
  if ($null -ne $childProcess -and -not $childProcess.HasExited) {
    Stop-ProcessTree -ProcessId $childProcess.Id
  }
} finally {
  Clear-InteractiveEnvironment
}

Write-OperatorMessage "done exitCode=$exitCode reason=$exitReason"
exit $exitCode