# Regenerates the app icons in src/icons from assets/aec-logo.png
# (the logo from the golden template headers). Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root  = Split-Path $PSScriptRoot -Parent
$icons = Join-Path $root 'src\icons'
New-Item -ItemType Directory -Force $icons | Out-Null
$logo = [Drawing.Image]::FromFile((Join-Path $root 'assets\aec-logo.png'))

# Logo centred on white, scaled to `fill` of the canvas.
function Save-Icon([int]$size, [double]$fill, [string]$name) {
  $bmp = New-Object Drawing.Bitmap $size, $size
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.Clear([Drawing.Color]::White)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.SmoothingMode = 'HighQuality'
  $s = [int]($size * $fill); $o = [int](($size - $s) / 2)
  $g.DrawImage($logo, $o, $o, $s, $s)
  $bmp.Save((Join-Path $icons $name), [Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

try {
  Save-Icon 180 0.78 'icon-180.png'   # iOS home screen (iOS rounds the corners itself)
  Save-Icon 192 0.78 'icon-192.png'
  Save-Icon 512 0.60 'icon-512.png'   # also the maskable icon: stay inside the safe zone
  Save-Icon 256 1.00 'logo.png'       # app bar and report header
} finally { $logo.Dispose() }

Write-Host "Icons written to $icons"
