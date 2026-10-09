[CmdletBinding()]
param(
    [string]$Distribution = '',
    [string]$LinuxUser = '',
    [string]$InstallRoot = '',
    [ValidatePattern('^v[0-9A-Za-z.-]+$')][string]$Release = 'v0.4.68'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if (!$InstallRoot) {
    if (!(Test-Path -LiteralPath 'E:\')) { throw 'E: is unavailable. Connect the drive or choose an explicit -InstallRoot; installation will not silently use C:.' }
    $InstallRoot = 'E:\WSL\apps\x-dde'
}
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
if ($InstallRoot -notmatch '^[A-Za-z]:\\' -or $InstallRoot.Contains('"')) { throw 'Choose an absolute local drive directory.' }
$savedConfigPath = Join-Path $InstallRoot 'bin/workbench.json'
$savedConfig = $null
if (Test-Path -LiteralPath $savedConfigPath -PathType Leaf) {
    try { $savedConfig = Get-Content -LiteralPath $savedConfigPath -Raw | ConvertFrom-Json }
    catch { throw 'Existing workbench.json is invalid. Review the local configuration before upgrading.' }
}
New-Item -ItemType Directory -Path (Join-Path $InstallRoot 'tmp') -Force | Out-Null
$env:TEMP = Join-Path $InstallRoot 'tmp'
$env:TMP = $env:TEMP
if (!(Get-Command wsl.exe -ErrorAction SilentlyContinue)) { throw 'Install WSL2 first in an administrator terminal: wsl --install. Restart Windows, then run this installer again.' }
$distributions = (& wsl.exe --list --quiet) -replace "`0", ''
if ($LASTEXITCODE -ne 0) { throw 'WSL is not ready. Run wsl --install in an administrator terminal and restart Windows.' }
# Reuse the shared workspace before considering a fresh Linux installation.
if (!$Distribution) {
    $Distribution = if ($savedConfig.distribution) { $savedConfig.distribution }
    elseif ('WSL' -in ($distributions | ForEach-Object { $_.Trim() })) { 'WSL' }
    else { 'Ubuntu-24.04' }
}
if (!$LinuxUser -and $savedConfig.distribution -eq $Distribution) { $LinuxUser = $savedConfig.user }
if ($Distribution -notin ($distributions | ForEach-Object { $_.Trim() })) {
    $diskLocation = if ($InstallRoot -eq 'E:\WSL\apps\x-dde') { 'E:\WSL\system' } else { Join-Path $InstallRoot 'WSL' }
    if (Test-Path -LiteralPath (Join-Path $diskLocation 'ext4.vhdx')) { throw 'The shared Linux disk already exists. Register or select its distribution before installing; existing disks will not be overwritten.' }
    & wsl.exe --install --distribution $Distribution --location $diskLocation --no-launch
    if ($LASTEXITCODE -ne 0) { throw 'WSL installation requires administrator access or a Windows restart. Complete the displayed Windows step, then re-run this installer.' }
    & wsl.exe -d $Distribution -u root -- useradd --create-home --shell /bin/bash opendde
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the dedicated Linux account.' }
    $LinuxUser = 'opendde'
}
if ([IO.Path]::GetPathRoot($InstallRoot) -eq 'E:\') {
    $registered = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss\*' -ErrorAction SilentlyContinue | Where-Object DistributionName -eq $Distribution | Select-Object -First 1
    $diskBase = ([string]$registered.BasePath) -replace '^\\\\\?\\', ''
    if (!$diskBase -or [IO.Path]::GetPathRoot($diskBase) -ne 'E:\') { throw 'The selected WSL distribution is not registered on E:. Choose an E: distribution; existing distributions will not be moved automatically.' }
}
if (!$LinuxUser) {
    $LinuxUser = ((& wsl.exe -d $Distribution -- whoami) | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or !$LinuxUser) { throw 'Open your WSL distribution once to finish its initial user setup.' }
}
if ($LinuxUser -eq 'root') { throw 'Choose an existing non-root account using -LinuxUser. Workbench must not run as root.' }
$linuxRoot = ((& wsl.exe -d $Distribution -u $LinuxUser -- wslpath -a -u $InstallRoot.Replace('\', '/')) | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve installation location in WSL.' }
$linuxHome = ((& wsl.exe -d $Distribution -u $LinuxUser -- printenv HOME) | Out-String).Trim()
if (!$linuxHome.StartsWith('/')) { throw 'Could not resolve the Linux account home directory.' }
$prefix = "$linuxHome/.local/share/opendde-workbench/app"
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
# Windows uses its own network/proxy; Linux verifies the same files again before installing.
$base = "https://github.com/Victor-Xu-1/X-DDE/releases/download/$Release"
$downloads = Join-Path $InstallRoot 'downloads'
$bin = Join-Path $InstallRoot 'bin'
New-Item -ItemType Directory -Path $downloads, $bin -Force | Out-Null
Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 "$base/SHA256SUMS" -OutFile (Join-Path $downloads 'SHA256SUMS')
$checksums = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $downloads 'SHA256SUMS')) {
    $parts = $line -split '\s+', 2
    if ($parts.Count -eq 2 -and $parts[0] -match '^[a-f0-9]{64}$') { $checksums[$parts[1]] = $parts[0] }
}
function Get-ReleaseFile([string]$Name, [string]$Destination) {
    if (!$checksums.ContainsKey($Name)) { throw "Release checksum missing: $Name" }
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 "$base/$Name" -OutFile $Destination
    if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ne $checksums[$Name]) {
        throw "Release checksum mismatch: $Name. Download again from the official release."
    }
}
Get-ReleaseFile 'install.sh' (Join-Path $InstallRoot 'install.sh')
# Preserve the released asset name, but keep the internal bridge off the command aliases.
Get-ReleaseFile 'opendde.ps1' (Join-Path $bin 'xdde-launcher.ps1')
$wheel = "x_dde-$($Release.Substring(1))-py3-none-any.whl"
Get-ReleaseFile $wheel (Join-Path $downloads $wheel)
$uvVersion = ''
& wsl.exe -d $Distribution -u $LinuxUser -- test -x "$prefix/bin/uv"
if ($LASTEXITCODE -eq 0) {
    $uvVersion = (& wsl.exe -d $Distribution -u $LinuxUser -- "$prefix/bin/uv" --version | Out-String).Trim()
}
if ($uvVersion -notlike 'uv 0.12.20*') {
    $uvBase = 'https://github.com/astral-sh/uv/releases/download/0.12.20'
    foreach ($name in @('uv-x86_64-unknown-linux-gnu.tar.gz', 'uv-x86_64-unknown-linux-gnu.tar.gz.sha256')) {
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 "$uvBase/$name" -OutFile (Join-Path $downloads $name)
    }
}
& wsl.exe -d $Distribution -u $LinuxUser -- bash "$linuxRoot/install.sh" $Release $prefix "$linuxRoot/downloads"
if ($LASTEXITCODE -ne 0) { throw 'Workbench install failed. Fix the displayed error and run this installer again.' }
@{ distribution = $Distribution; user = $LinuxUser; prefix = $prefix; home = "$linuxHome/.local/share/opendde-workbench" } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $bin 'workbench.json') -Encoding UTF8
foreach ($launcher in @('X-DDE.cmd', 'xdde.cmd', 'opendde.cmd')) {
    '@echo off', 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0xdde-launcher.ps1" %*', 'exit /b %errorlevel%' | Set-Content -LiteralPath (Join-Path $bin $launcher) -Encoding ASCII
}
$legacyBridge = Join-Path $bin 'opendde.ps1'
if (Test-Path -LiteralPath $legacyBridge -PathType Leaf) { Remove-Item -LiteralPath $legacyBridge }
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($bin -notin ($userPath -split ';')) { [Environment]::SetEnvironmentVariable('Path', "$bin;$userPath", 'User') }
$env:Path = "$bin;$env:Path"
Write-Host 'Installed. X-DDE UI or xdde dashboard starts the workbench. xdde stop closes it.'
Write-Host 'Open a new terminal to use the command from any folder.'
Write-Host 'Python runs inside the Linux disk of your WSL distribution; model/data locations are selectable in the panel.'
