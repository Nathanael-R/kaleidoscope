<#
.SYNOPSIS
Runs ffmpeg with a cleaner PowerShell progress UI for retiming and trimming videos.

.DESCRIPTION
Wraps ffprobe + ffmpeg so long-running video operations produce a readable
Write-Progress bar instead of raw ffmpeg log spam.

Supports:
- retiming video with an optional matching audio retime
- trimming by start/end or start/duration
- quiet, colored terminal summaries

.PARAMETER InputFile
Path to the source media file.

.PARAMETER OutputFile
Path to the rendered media file.

.PARAMETER SpeedMultiplier
Playback speed multiplier. 1.0 keeps original speed, 1.1 is 10% faster,
0.9 is 10% slower.

.PARAMETER StartTime
Optional trim start time. Accepts formats ffmpeg understands, for example
00:00:03.500.

.PARAMETER EndTime
Optional trim end time.

.PARAMETER Duration
Optional trim duration. Use this instead of EndTime.

.PARAMETER MuteAudio
Drops audio from the output.

.PARAMETER Overwrite
Overwrite the output if it already exists.

.EXAMPLE
.\scripts\Invoke-FfmpegVideoTool.ps1 `
  -InputFile .\input.webm `
  -OutputFile .\output.webm `
  -SpeedMultiplier 1.08 `
  -Overwrite

.EXAMPLE
.\scripts\Invoke-FfmpegVideoTool.ps1 `
  -InputFile .\input.webm `
  -OutputFile .\clip.webm `
  -StartTime 00:00:04.000 `
  -EndTime 00:00:12.500 `
  -Overwrite
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$InputFile,

    [Parameter(Mandatory)]
    [string]$OutputFile,

    [ValidateRange(0.25, 4.0)]
    [double]$SpeedMultiplier = 1.0,

    [string]$StartTime,

    [string]$EndTime,

    [string]$Duration,

    [switch]$MuteAudio,

    [switch]$Overwrite
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-RequiredCommandPath {
    param([Parameter(Mandatory)][string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "$Name was not found in PATH."
    }

    return $command.Source
}

function Format-InvariantNumber {
    param([double]$Value)

    return $Value.ToString('0.######', [System.Globalization.CultureInfo]::InvariantCulture)
}

function Get-MediaDurationSeconds {
    param([Parameter(Mandatory)][string]$Path)

    $raw = & $script:FfprobePath -v error -show_entries format=duration -of default=nw=1:nk=1 $Path
    if (-not $raw) {
        throw 'Could not read media duration from ffprobe.'
    }

    return [double]::Parse($raw.Trim(), [System.Globalization.CultureInfo]::InvariantCulture)
}

function Test-HasAudioStream {
    param([Parameter(Mandatory)][string]$Path)

    $raw = & $script:FfprobePath -v error -select_streams a:0 -show_entries stream=codec_type -of default=nw=1:nk=1 $Path
    return -not [string]::IsNullOrWhiteSpace(($raw | Out-String).Trim())
}

function New-AtempoChain {
    param([Parameter(Mandatory)][double]$Tempo)

    $parts = New-Object System.Collections.Generic.List[string]
    $remaining = $Tempo

    while ($remaining -gt 2.0) {
        $parts.Add('atempo=2.0')
        $remaining /= 2.0
    }

    while ($remaining -lt 0.5) {
        $parts.Add('atempo=0.5')
        $remaining /= 0.5
    }

    $parts.Add("atempo=$(Format-InvariantNumber $remaining)")
    return ($parts -join ',')
}

function Convert-TimestampToSeconds {
    param([Parameter(Mandatory)][string]$Value)

    $trimmed = $Value.Trim()
    $asTimeSpan = [TimeSpan]::Zero

    if ([TimeSpan]::TryParse($trimmed, [ref]$asTimeSpan)) {
        return $asTimeSpan.TotalSeconds
    }

    return [double]::Parse($trimmed, [System.Globalization.CultureInfo]::InvariantCulture)
}

function Get-SecondsFromProgress {
    param([hashtable]$ProgressState)

    if ($ProgressState.ContainsKey('out_time')) {
        $timeSpan = [TimeSpan]::Zero
        if ([TimeSpan]::TryParse($ProgressState['out_time'], [ref]$timeSpan)) {
            return $timeSpan.TotalSeconds
        }
    }

    return 0.0
}

function Format-OptionalValue {
    param([AllowNull()][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return '-'
    }

    return $Value
}

if ($EndTime -and $Duration) {
    throw 'Use either EndTime or Duration, not both.'
}

$script:FfmpegPath = Get-RequiredCommandPath 'ffmpeg'
$script:FfprobePath = Get-RequiredCommandPath 'ffprobe'

$resolvedInput = (Resolve-Path $InputFile).Path
$resolvedOutput = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputFile)
$inputDuration = Get-MediaDurationSeconds -Path $resolvedInput

$startSeconds = if ($StartTime) { Convert-TimestampToSeconds -Value $StartTime } else { 0.0 }

if ($startSeconds -lt 0) {
    throw 'StartTime must be greater than or equal to zero.'
}

$trimDurationSeconds = $null
if ($Duration) {
    $trimDurationSeconds = Convert-TimestampToSeconds -Value $Duration
}

if ($EndTime) {
    $endSeconds = Convert-TimestampToSeconds -Value $EndTime
    $trimDurationSeconds = $endSeconds - $startSeconds
}

if ($trimDurationSeconds -ne $null -and $trimDurationSeconds -le 0) {
    throw 'Trim duration must be greater than zero.'
}

$effectiveSourceDuration = if ($trimDurationSeconds -ne $null) {
    $trimDurationSeconds
} else {
    [Math]::Max(0.0, $inputDuration - $startSeconds)
}

$expectedOutputDuration = $effectiveSourceDuration / $SpeedMultiplier
$hasAudio = -not $MuteAudio -and (Test-HasAudioStream -Path $resolvedInput)
$setPtsFactor = 1.0 / $SpeedMultiplier
$setPtsLiteral = Format-InvariantNumber $setPtsFactor

$ffmpegArgs = @(
    '-hide_banner'
    '-loglevel', 'error'
    '-progress', 'pipe:1'
)

if ($Overwrite) {
    $ffmpegArgs += '-y'
} else {
    $ffmpegArgs += '-n'
}

$ffmpegArgs += '-i'
$ffmpegArgs += $resolvedInput

if ($StartTime) {
    $ffmpegArgs += '-ss'
    $ffmpegArgs += $StartTime
}

if ($Duration) {
    $ffmpegArgs += '-t'
    $ffmpegArgs += $Duration
} elseif ($trimDurationSeconds -ne $null) {
    $ffmpegArgs += '-to'
    $ffmpegArgs += (Format-InvariantNumber $trimDurationSeconds)
}

if ($hasAudio) {
    $audioTempoChain = New-AtempoChain -Tempo $SpeedMultiplier
    $filterComplex = "[0:v]setpts=${setPtsLiteral}*PTS[v];[0:a]${audioTempoChain}[a]"
    $ffmpegArgs += @(
        '-filter_complex', $filterComplex,
        '-map', '[v]',
        '-map', '[a]'
    )
} else {
    $ffmpegArgs += @('-filter:v', "setpts=${setPtsLiteral}*PTS")
    if ($MuteAudio) {
        $ffmpegArgs += '-an'
    }
}

$ffmpegArgs += $resolvedOutput

$activity = 'ffmpeg video render'
$outputName = Split-Path $resolvedOutput -Leaf
$progressState = @{}
$startTimeUtc = Get-Date

Write-Host "Input : $resolvedInput" -ForegroundColor Cyan
Write-Host "Output: $resolvedOutput" -ForegroundColor Cyan
Write-Host ("Speed : x{0}" -f (Format-InvariantNumber $SpeedMultiplier)) -ForegroundColor DarkGray

if ($StartTime -or $EndTime -or $Duration) {
    Write-Host ("Trim  : start={0} end={1} duration={2}" -f (Format-OptionalValue $StartTime), (Format-OptionalValue $EndTime), (Format-OptionalValue $Duration)) -ForegroundColor DarkGray
}

if ($MuteAudio) {
    Write-Host 'Audio : muted' -ForegroundColor DarkGray
} elseif ($hasAudio) {
    Write-Host 'Audio : preserved and retimed' -ForegroundColor DarkGray
} else {
    Write-Host 'Audio : none detected' -ForegroundColor DarkGray
}

try {
    & $script:FfmpegPath @ffmpegArgs 2>&1 | ForEach-Object {
        $line = "$($_)".Trim()
        if ([string]::IsNullOrWhiteSpace($line)) {
            return
        }

        if ($line -match '^(?<key>[^=]+)=(?<value>.*)$') {
            $key = $matches['key']
            $value = $matches['value']
            $progressState[$key] = $value

            if ($key -eq 'progress') {
                $currentSeconds = Get-SecondsFromProgress -ProgressState $progressState
                $percent = 0.0
                if ($expectedOutputDuration -gt 0) {
                    $percent = [Math]::Min(100, [Math]::Round(($currentSeconds / $expectedOutputDuration) * 100, 1))
                }

                $speedText = if ($progressState.ContainsKey('speed')) { $progressState['speed'] } else { '?' }
                $fpsText = if ($progressState.ContainsKey('fps')) { $progressState['fps'] } else { '?' }
                $frameText = if ($progressState.ContainsKey('frame')) { $progressState['frame'] } else { '?' }
                $status = '{0}% | {1:N1}s / {2:N1}s | fps {3} | speed {4}' -f $percent, $currentSeconds, $expectedOutputDuration, $fpsText, $speedText
                $operation = "frame $frameText -> $outputName"
                Write-Progress -Activity $activity -Status $status -CurrentOperation $operation -PercentComplete $percent
            }

            return
        }

        Write-Host $line -ForegroundColor DarkGray
    }

    if ($LASTEXITCODE -ne 0) {
        throw "ffmpeg exited with code $LASTEXITCODE."
    }

    Write-Progress -Activity $activity -Completed
    $elapsed = (Get-Date) - $startTimeUtc

    Write-Host ''
    Write-Host 'Render complete.' -ForegroundColor Green
    Write-Host "Saved to $resolvedOutput" -ForegroundColor Green
    Write-Host ('Elapsed: {0:mm\:ss}' -f $elapsed) -ForegroundColor DarkGray
}
catch {
    Write-Progress -Activity $activity -Completed
    throw
}