#!/usr/bin/env bash
# Fetch a static, libass-enabled ffmpeg + ffprobe for bundling as Tauri
# sidecars, so a released build works without the user installing anything.
#
# Tauri's `externalBin` expects each binary named with the Rust target triple,
# e.g. binaries/ffmpeg-aarch64-apple-darwin. This script places them there.
# It downloads GPL builds (libass pulls in x264/x265): keep the app GPL and
# ship the corresponding source offer when you distribute.
#
# Sources (edit URLs to a build+version you trust and have checked):
#   macOS  — https://evermeet.cx/ffmpeg/  (arm64 + x86_64, static, with libass)
#   Linux  — https://johnvansickle.com/ffmpeg/  or  https://github.com/BtbN/FFmpeg-Builds
#   Windows— https://github.com/BtbN/FFmpeg-Builds  (gpl builds include libass)
#
# Usage:  bash scripts/fetch-ffmpeg.sh
set -euo pipefail

DEST="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/binaries"
mkdir -p "$DEST"

triple="$(rustc -vV | sed -n 's/host: //p')"
echo "Target triple: $triple"
echo "Destination:   $DEST"
echo
echo "This scaffold does not hard-code a download URL — pick a build you trust."
echo "Verify the 'ass' filter after placing the binaries:"
echo "  \"$DEST/ffmpeg-$triple\" -hide_banner -filters | grep ' ass '"
echo
echo "Then enable bundling in src-tauri/tauri.conf.json:"
echo '  "bundle": { "externalBin": ["binaries/ffmpeg", "binaries/ffprobe"], ... }'
echo
echo "Tauri appends the triple automatically; ship files named:"
echo "  binaries/ffmpeg-$triple   binaries/ffprobe-$triple"
