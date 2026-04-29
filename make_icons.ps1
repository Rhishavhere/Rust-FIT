Add-Type -AssemblyName System.Drawing

$iconsDir = "fit-app\src-tauri\icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

# Create 256x256 base image with "FIT" text
$bmp = New-Object System.Drawing.Bitmap(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# Dark background
$g.Clear([System.Drawing.Color]::FromArgb(255, 20, 22, 35))

# Draw rounded rect background (simulate with ellipse)
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 30, 140, 255))
$g.FillRectangle($bgBrush, 20, 80, 216, 100)
$bgBrush.Dispose()

# Draw "FIT" text
$font = New-Object System.Drawing.Font("Arial", 90, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = [System.Drawing.Brushes]::White
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString("FIT", $font, $textBrush, [System.Drawing.RectangleF]::new(0, 0, 256, 256), $sf)
$font.Dispose()
$sf.Dispose()
$g.Dispose()

# Save PNG
$pngPath = "$iconsDir\icon.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Created: $pngPath"

# Create ICO with multiple sizes
$sizes = @(16, 32, 48, 64, 128, 256)
$images = [System.Collections.ArrayList]::new()

foreach ($sz in $sizes) {
    $resized = New-Object System.Drawing.Bitmap($sz, $sz)
    $gr = [System.Drawing.Graphics]::FromImage($resized)
    $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gr.DrawImage($bmp, 0, 0, $sz, $sz)
    $gr.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $resized.Dispose()
    $null = $images.Add(@{ Size = $sz; Data = $ms.ToArray() })
    $ms.Dispose()
}
$bmp.Dispose()

# Build ICO binary
$icoMs = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($icoMs)

# ICONDIR header
$bw.Write([uint16]0)               # Reserved
$bw.Write([uint16]1)               # Type = 1 (ICO)
$bw.Write([uint16]$images.Count)   # Number of images

# ICONDIRENTRY for each image (16 bytes each)
$offset = [uint32](6 + 16 * $images.Count)
foreach ($img in $images) {
    $w = if ($img.Size -eq 256) { [byte]0 } else { [byte]$img.Size }
    $h = if ($img.Size -eq 256) { [byte]0 } else { [byte]$img.Size }
    $bw.Write($w)
    $bw.Write($h)
    $bw.Write([byte]0)    # Color count (0 = no palette)
    $bw.Write([byte]0)    # Reserved
    $bw.Write([uint16]1)  # Color planes
    $bw.Write([uint16]32) # Bits per pixel
    $bw.Write([uint32]$img.Data.Length)
    $bw.Write($offset)
    $offset += [uint32]$img.Data.Length
}

# Image data
foreach ($img in $images) {
    $bw.Write($img.Data)
}
$bw.Flush()

$icoBytes = $icoMs.ToArray()
$bw.Dispose()
$icoMs.Dispose()

$icoPath = "$iconsDir\icon.ico"
[System.IO.File]::WriteAllBytes($icoPath, $icoBytes)
Write-Host "Created: $icoPath ($($icoBytes.Length) bytes)"
Write-Host "Done! Run: cargo check --workspace"
