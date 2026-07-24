<#
  Fetch libass-enabled ffmpeg + ffprobe for the Windows bundle.

  Downloads a GPL Windows build (BtbN), extracts ffmpeg.exe and ffprobe.exe,
  and drops them in src-tauri/binaries/ named with the Rust target triple that
  tauri.windows.conf.json's `externalBin` expects. Tauri copies them next to the
  app exe at build time; audio.rs `resolve_bin` finds them at runtime.

  Run from anywhere; paths resolve relative to this script.

  Env overrides:
    FFMPEG_ZIP_URL  - source zip (default: BtbN latest GPL win64, includes libass)
    FFMPEG_TARGET   - Rust target triple (default: x86_64-pc-windows-msvc)
#>
$ErrorActionPreference = "Stop"

$zipUrl = if ($env:FFMPEG_ZIP_URL) { $env:FFMPEG_ZIP_URL } else {
  "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
}
$triple = if ($env:FFMPEG_TARGET) { $env:FFMPEG_TARGET } else { "x86_64-pc-windows-msvc" }

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcTauri  = Split-Path -Parent $scriptDir
$binDir    = Join-Path $srcTauri "binaries"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$ffmpegOut  = Join-Path $binDir "ffmpeg-$triple.exe"
$ffprobeOut = Join-Path $binDir "ffprobe-$triple.exe"

if ((Test-Path $ffmpegOut) -and (Test-Path $ffprobeOut)) {
  Write-Host "ffmpeg + ffprobe already present for $triple — skipping download."
  exit 0
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("ffmpeg-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zip = Join-Path $tmp "ffmpeg.zip"

Write-Host "Downloading $zipUrl ..."
Invoke-WebRequest -Uri $zipUrl -OutFile $zip

Write-Host "Extracting ..."
Expand-Archive -Path $zip -DestinationPath $tmp -Force

$ffmpeg  = Get-ChildItem -Path $tmp -Recurse -Filter "ffmpeg.exe"  | Select-Object -First 1
$ffprobe = Get-ChildItem -Path $tmp -Recurse -Filter "ffprobe.exe" | Select-Object -First 1
if (-not $ffmpeg -or -not $ffprobe) {
  throw "ffmpeg.exe / ffprobe.exe not found in the downloaded archive."
}

Copy-Item $ffmpeg.FullName  $ffmpegOut  -Force
Copy-Item $ffprobe.FullName $ffprobeOut -Force
Remove-Item -Recurse -Force $tmp

Write-Host "Placed:"
Write-Host "  $ffmpegOut"
Write-Host "  $ffprobeOut"
