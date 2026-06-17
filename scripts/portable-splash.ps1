# Animated splash during portable Setup.exe unpack (started from custom portable.nsi).
$ErrorActionPreference = 'SilentlyContinue'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$bg = [Drawing.Color]::FromArgb(46, 52, 64)
$text = [Drawing.Color]::FromArgb(236, 239, 244)
$muted = [Drawing.Color]::FromArgb(216, 222, 233)
$accent = [Drawing.Color]::FromArgb(136, 192, 208)

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Verstak Setup'
$form.Size = New-Object Drawing.Size(460, 250)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.BackColor = $bg
$form.ForeColor = $text
$form.TopMost = $true
$form.ShowInTaskbar = $true

$brand = New-Object System.Windows.Forms.Label
$brand.Text = 'VERSTAK'
$brand.Font = New-Object Drawing.Font('Segoe UI', 8, [Drawing.FontStyle]::Bold)
$brand.ForeColor = [Drawing.Color]::FromArgb(129, 161, 193)
$brand.AutoSize = $true
$brand.Location = New-Object Drawing.Point(24, 18)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Подготовка установщика'
$title.Font = New-Object Drawing.Font('Segoe UI', 14, [Drawing.FontStyle]::Bold)
$title.AutoSize = $true
$title.Location = New-Object Drawing.Point(24, 44)

$status = New-Object System.Windows.Forms.Label
$status.Text = 'Распаковка файлов…'
$status.Font = New-Object Drawing.Font('Segoe UI', 10)
$status.ForeColor = $muted
$status.AutoSize = $true
$status.Location = New-Object Drawing.Point(24, 78)

$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
$progress.MarqueeAnimationSpeed = 28
$progress.Size = New-Object Drawing.Size(404, 10)
$progress.Location = New-Object Drawing.Point(24, 118)

$hint = New-Object System.Windows.Forms.Label
$hint.Text = 'Обычно 10–20 секунд. Не закрывайте это окно.'
$hint.Font = New-Object Drawing.Font('Segoe UI', 9)
$hint.ForeColor = $muted
$hint.Size = New-Object Drawing.Size(404, 40)
$hint.Location = New-Object Drawing.Point(24, 148)

$iconPath = Join-Path $PSScriptRoot 'icon.png'
if (Test-Path -LiteralPath $iconPath) {
  $pic = New-Object System.Windows.Forms.PictureBox
  $pic.Size = New-Object Drawing.Size(48, 48)
  $pic.Location = New-Object Drawing.Point(380, 24)
  $pic.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
  $pic.Image = [Drawing.Image]::FromFile($iconPath)
  $form.Controls.Add($pic)
}

$msgs = @(
  'Распаковка файлов…',
  'Подготовка мастера…',
  'Запуск установщика…'
)
$msgIndex = 0
$msgTimer = New-Object System.Windows.Forms.Timer
$msgTimer.Interval = 2200
$msgTimer.Add_Tick({
  $msgIndex = ($msgIndex + 1) % $msgs.Length
  $status.Text = $msgs[$msgIndex]
})
$msgTimer.Start()

$poll = New-Object System.Windows.Forms.Timer
$poll.Interval = 400
$poll.Add_Tick({
  $setup = Get-Process -Name 'VerstakSetup' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -or $_.MainWindowTitle }
  if ($setup) {
    $poll.Stop()
    $msgTimer.Stop()
    $form.Close()
  }
})
$poll.Start()

$form.Controls.AddRange(@($brand, $title, $status, $progress, $hint))
[void]$form.ShowDialog()