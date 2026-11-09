
# Compile off the serving path, then switch the local server to the new build.
param([ValidateRange(1024,65535)][int]$Port = 3000, [switch]$ReplaceLegacy)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$root = (Get-Location).Path
$node = (Get-Command node).Source
$stateDir = Join-Path $root '.next-local'
$stateFile = Join-Path $stateDir 'active.json'
[void][IO.Directory]::CreateDirectory($stateDir)
$lock = [IO.File]::Open((Join-Path $stateDir 'release.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
try {
  $previous = if (Test-Path -LiteralPath $stateFile) { Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json }
    else { @{ dir = '.next'; id = '' } }
  $id = [Guid]::NewGuid().ToString('N')
  $slot = if ($previous.dir -eq '.next-local/a') { 'b' } else { 'a' }
  $next = @{ dir = ".next-local/$slot"; id = $id }

  function Start-Local($release) {
    $env:BARBERFLOW_DIST_DIR = $release.dir
    $env:BARBERFLOW_DEPLOYMENT_ID = $release.id
    Start-Process -FilePath $node -ArgumentList "node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port $Port" -WorkingDirectory $root -WindowStyle Hidden -PassThru
  }

  $env:BARBERFLOW_DIST_DIR = $next.dir
  $env:BARBERFLOW_DEPLOYMENT_ID = $id
  $tsconfig = Join-Path $root 'tsconfig.json'
  $originalConfig = [IO.File]::ReadAllBytes($tsconfig)
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'A compilação falhou. O servidor anterior continua ativo.' }
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'A verificação de tipos falhou. O servidor anterior continua ativo.' }
  } finally {
    # Next adds its generated type paths during compilation. Keep local slots out of the tracked config.
    [IO.File]::WriteAllBytes($tsconfig, $originalConfig)
  }

  $oldStatic = Join-Path $previous.dir 'static'
  $newStatic = Join-Path $next.dir 'static'
  if (Test-Path -LiteralPath $oldStatic) {
    # Only copy assets absent from the new build. Some framework files share names.
    Get-ChildItem -LiteralPath $oldStatic -File -Recurse | ForEach-Object {
      $target = Join-Path $newStatic ([IO.Path]::GetRelativePath((Join-Path $root $oldStatic), $_.FullName))
      if (!(Test-Path -LiteralPath $target)) {
        [void][IO.Directory]::CreateDirectory((Split-Path $target -Parent))
        Copy-Item -LiteralPath $_.FullName -Destination $target
      }
    }
  }

  $listener = netstat -ano -p TCP | Select-String "^\s*TCP\s+127\.0\.0\.1:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$" | Select-Object -First 1
  if ($listener) {
    $owner = $listener.Matches[0].Groups[1].Value
    if (!$ReplaceLegacy -and $previous.pid -ne [int]$owner) {
      throw 'O servidor nesta porta não foi iniciado pelo script. Confira o processo antes de usar -ReplaceLegacy.'
    }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$owner"
    if ($process.CommandLine -notmatch "node_modules[/\\]next[/\\]dist[/\\]bin[/\\]next.*\bstart\b.*--hostname 127\.0\.0\.1 --port $Port\b") {
      throw 'A porta está em uso por outro processo.'
    }
    Stop-Process -Id $owner -ErrorAction Stop
    Wait-Process -Id $owner -ErrorAction SilentlyContinue
  }

  $running = Start-Local $next
  $base = "http://127.0.0.1:$Port"
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($running.HasExited) { break }
    try {
      $page = Invoke-WebRequest "$base/" -TimeoutSec 2
      $css = [regex]::Match($page.Content, '<link[^>]*href="(/_next/static/[^"]+\.css(?:\?[^"]*)?)"')
      if ($page.StatusCode -eq 200 -and $css.Success) {
        $asset = Invoke-WebRequest ($base + $css.Groups[1].Value.Replace('&amp;', '&')) -TimeoutSec 2
        if ($asset.StatusCode -eq 200 -and $asset.Headers.'Content-Type' -like 'text/css*') {
          $ready = $true
          break
        }
      }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (!$ready) {
    if (!$running.HasExited) { Stop-Process -Id $running.Id }
    if ($listener -and (Test-Path -LiteralPath (Join-Path $previous.dir 'BUILD_ID'))) {
      $restored = Start-Local $previous
      if ($previous.pid) {
        $previous.pid = $restored.Id
        $previous | ConvertTo-Json -Compress | Set-Content -LiteralPath $stateFile -Encoding utf8
      }
    }
    throw 'A nova versão não passou no teste de carregamento de HTML e CSS.'
  }
  $next.pid = $running.Id
  $next | ConvertTo-Json -Compress | Set-Content -LiteralPath $stateFile -Encoding utf8
  Write-Output "BARBERFLOW validado em $base"
} finally {
  $lock.Dispose()
}
