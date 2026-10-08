#Requires -Version 5.1
<#
  st-tunnel.ps1 — 给电脑上的 SillyTavern 开一条 Cloudflare 临时隧道，
  并把生成的公网地址写入 sillytavern/url.json，让手机上的入口页自动拿到新地址。

  用法:
    powershell -ExecutionPolicy Bypass -File tools/st-tunnel.ps1
    powershell -ExecutionPolicy Bypass -File tools/st-tunnel.ps1 -Port 8000 -Push
#>
[CmdletBinding()]
param(
  [int]$Port = 8000,
  [switch]$Push,
  [switch]$NoWait
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $scriptDir
$binDir    = Join-Path $scriptDir 'bin'
$exe       = Join-Path $binDir 'cloudflared.exe'
$urlJson   = Join-Path $repoRoot 'sillytavern/url.json'
$logDir    = Join-Path $env:TEMP 'st-tunnel'

function Say($m) { Write-Host "[st-tunnel] $m" -ForegroundColor Cyan }

New-Item -ItemType Directory -Force -Path $binDir | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# --- 1. 准备 cloudflared -------------------------------------------------
if (-not (Test-Path $exe)) {
  Say '未找到 cloudflared.exe，正在下载…'
  $dl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
  Invoke-WebRequest -Uri $dl -OutFile $exe -UseBasicParsing
  Say '下载完成。'
} else {
  Say '已存在 cloudflared.exe，跳过下载。'
}

# --- 2. 检查 SillyTavern 是否在监听 --------------------------------------
$listening = $null
try { $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue } catch { }
if (-not $listening) {
  Write-Warning "端口 $Port 上没有监听到服务。请先启动 SillyTavern，否则隧道打开会显示 502。"
} else {
  Say "检测到端口 $Port 正在监听。"
}

# --- 3. 启动隧道 ---------------------------------------------------------
$outLog = Join-Path $logDir 'out.log'
$errLog = Join-Path $logDir 'err.log'
Remove-Item $outLog, $errLog -Force -ErrorAction SilentlyContinue

Say "启动隧道 -> http://localhost:$Port"
$proc = Start-Process -FilePath $exe -ArgumentList @('tunnel', '--url', "http://localhost:$Port", '--no-autoupdate') -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -NoNewWindow

# --- 4. 等公网地址出现 ---------------------------------------------------
$url = $null
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 700
  $text = ''
  foreach ($f in @($errLog, $outLog)) {
    if (Test-Path $f) { $text += (Get-Content $f -Raw -ErrorAction SilentlyContinue) }
  }
  if ($text) {
    $m = [regex]::Match($text, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
    if ($m.Success) { $url = $m.Value; break }
  }
  if ($proc.HasExited) { break }
}

if (-not $url) {
  Write-Warning '没有拿到隧道地址。cloudflared 输出如下:'
  foreach ($f in @($errLog, $outLog)) {
    if (Test-Path $f) { Get-Content $f -Tail 30 }
  }
  if (-not $proc.HasExited) { try { $proc.Kill() } catch { } }
  exit 1
}

# --- 5. 写入 url.json ----------------------------------------------------
$payload = [ordered]@{
  url       = $url
  updatedAt = (Get-Date).ToString('s')
  port      = $Port
  note      = '由 tools/st-tunnel.ps1 自动写入'
}
$json = $payload | ConvertTo-Json
[IO.File]::WriteAllText($urlJson, $json, (New-Object Text.UTF8Encoding($false)))

Write-Host ''
Write-Host '==================================================' -ForegroundColor Green
Write-Host "  手机打开: $url" -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor Green
Say "已写入 $urlJson"

# --- 6. 可选：提交推送 ---------------------------------------------------
if ($Push) {
  Say '提交并推送 url.json …'
  Push-Location $repoRoot
  try {
    git add 'sillytavern/url.json'
    git -c user.name='st-tunnel' -c user.email='st-tunnel@local' commit -m 'chore: 更新 SillyTavern 隧道地址' --no-verify
    git push
    Say '推送完成，刷新入口页即可看到新地址。'
  } catch {
    Write-Warning "推送失败: $($_.Exception.Message)"
  } finally {
    Pop-Location
  }
} else {
  Say '提示: 加 -Push 参数可以自动提交并推送 url.json，让线上入口页同步。'
}

# --- 7. 保持运行 ---------------------------------------------------------
if ($NoWait) {
  Say '隧道已在后台运行，本脚本退出。'
  exit 0
}

Say '隧道运行中，关闭本窗口或按 Ctrl+C 即可停止。'
try {
  while (-not $proc.HasExited) { Start-Sleep -Seconds 2 }
} finally {
  if (-not $proc.HasExited) { try { $proc.Kill() } catch { } }
  Say '隧道已停止。'
}
