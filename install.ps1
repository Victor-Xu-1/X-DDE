[CmdletBinding()]
param(
    [string]$Distribution = 'Ubuntu-24.04',
    [string]$LinuxUser = '',
    [string]$InstallRoot = '',
    [ValidatePattern('^v[0-9A-Za-z.-]+$')][string]$Release = 'v0.4.0rc1'
)
$ErrorActionPreference = 'Stop'
if (!$InstallRoot) {
    $InstallRoot = if (Test-Path -LiteralPath 'E:\') { 'E:\OpenDDE\Workbench' } else { Join-Path $env:LOCALAPPDATA 'OpenDDE-Workbench' }
}
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
if ($InstallRoot -notmatch '^[A-Za-z]:\\' -or $InstallRoot.Contains('"')) { throw 'Choose an absolute local drive directory.' }
if (!(Get-Command wsl.exe -ErrorAction SilentlyContinue)) { throw 'Install WSL2 first in an administrator terminal: wsl --install. Restart Windows, then run this installer again.' }
$distributions = (& wsl.exe --list --quiet) -replace "`0", ''
if ($LASTEXITCODE -ne 0) { throw 'WSL is not ready. Run wsl --install in an administrator terminal and restart Windows.' }
if ($Distribution -notin ($distributions | ForEach-Object { $_.Trim() })) {
    & wsl.exe --install --distribution $Distribution --location (Join-Path $InstallRoot 'WSL') --no-launch
    if ($LASTEXITCODE -ne 0) { throw 'WSL installation requires administrator access or a Windows restart. Complete the displayed Windows step, then re-run this installer.' }
    & wsl.exe -d $Distribution -u root -- useradd --create-home --shell /bin/bash opendde
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the dedicated Linux account.' }
    $LinuxUser = 'opendde'
}
if (!$LinuxUser) {
    $LinuxUser = ((& wsl.exe -d $Distribution -- whoami) | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or !$LinuxUser) { throw 'Open your WSL distribution once to finish its initial user setup.' }
}
if ($LinuxUser -eq 'root') { throw 'Choose an existing non-root account using -LinuxUser. Workbench must not run as root.' }
$linuxRoot = ((& wsl.exe -d $Distribution -u $LinuxUser -- wslpath -a -u $InstallRoot) | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve installation location in WSL.' }
$linuxHome = ((& wsl.exe -d $Distribution -u $LinuxUser -- printenv HOME) | Out-String).Trim()
if (!$linuxHome.StartsWith('/')) { throw 'Could not resolve the Linux account home directory.' }
$prefix = "$linuxHome/.local/share/opendde-workbench/app"
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
# Both scripts come from the same immutable release as the wheel.
$base = "https://github.com/Victor-Xu-1/opendde-workbench/releases/download/$Release"
Invoke-WebRequest "$base/install.sh" -OutFile (Join-Path $InstallRoot 'install.sh')
& wsl.exe -d $Distribution -u $LinuxUser -- bash "$linuxRoot/install.sh" $Release $prefix
if ($LASTEXITCODE -ne 0) { throw 'Workbench install failed. Fix the displayed error and run this installer again.' }
$bin = Join-Path $InstallRoot 'bin'
New-Item -ItemType Directory -Path $bin -Force | Out-Null
Invoke-WebRequest "$base/opendde.ps1" -OutFile (Join-Path $bin 'opendde.ps1')
@{ distribution = $Distribution; user = $LinuxUser; prefix = $prefix; home = "$linuxHome/.local/share/opendde-workbench" } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $bin 'workbench.json') -Encoding UTF8
'@echo off', 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0opendde.ps1" %*', 'exit /b %errorlevel%' | Set-Content -LiteralPath (Join-Path $bin 'opendde.cmd') -Encoding ASCII
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($bin -notin ($userPath -split ';')) { [Environment]::SetEnvironmentVariable('Path', "$bin;$userPath", 'User') }
$env:Path = "$bin;$env:Path"
Write-Host 'Installed. OpenDDE UI or opendde dashboard starts the workbench. opendde stop closes it.'
Write-Host 'Open a new terminal to use the command from any folder.'
Write-Host 'Python runs inside the Linux disk of your WSL distribution; model/data locations are selectable in the panel.'
