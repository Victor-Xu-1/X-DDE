$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$target = Join-Path ([IO.Path]::GetTempPath()) ('X DDE installer ' + [guid]::NewGuid())
$previousPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$previousTemp = $env:TEMP
$previousTmp = $env:TMP
$fixtures = Join-Path $target 'fixtures'
New-Item -ItemType Directory -Path $fixtures -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repository 'install.sh') -Destination $fixtures
Copy-Item -LiteralPath (Join-Path $repository 'scripts/opendde.ps1') -Destination $fixtures
$versionLine = Get-Content -LiteralPath (Join-Path $repository 'pyproject.toml') | Where-Object { $_ -match '^version = ' }
$version = $versionLine.Split('"')[1]
$wheel = "x_dde-$version-py3-none-any.whl"
[IO.File]::WriteAllText((Join-Path $fixtures $wheel), 'Isolated download boundary')
$manifest = @('install.sh', 'opendde.ps1', $wheel) | ForEach-Object {
    (Get-FileHash -LiteralPath (Join-Path $fixtures $_) -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $_
}
$manifest | Set-Content -LiteralPath (Join-Path $fixtures 'SHA256SUMS') -Encoding ascii
$boundary = @{ corrupt = $false; installations = 0; distributions = @('OpenDDE', 'WSL'); lastDistribution = ''; free = 32GB; backingFree = 32GB; boots = 0; downloads = 0 }
$backingStore = Join-Path $fixtures 'registered backing storage'
New-Item -ItemType Directory -Path $backingStore -Force | Out-Null
# Isolate the external WSL/download boundaries; run the real installer and file writes.
function global:Get-Volume {
    param([string]$FilePath)
    $remaining = if ($FilePath -eq $backingStore) { $boundary.backingFree } else { $boundary.free }
    return [pscustomobject]@{DriveLetter='D';SizeRemaining=$remaining}
}
function global:Get-ItemProperty {
    param([string]$Path, $ErrorAction)
    if ($Path -notlike '*Lxss*') { throw 'Unexpected registry lookup in the isolated installer.' }
    return @('OpenDDE','WSL') | ForEach-Object { [pscustomobject]@{DistributionName=$_;BasePath=$backingStore} }
}
function global:wsl.exe {
    $global:LASTEXITCODE = 0
    if ($args[0] -eq '--list') { return $boundary.distributions }
    if ($args[0] -eq '-d') {
        $directoryIndex = [Array]::IndexOf($args, '--cd')
        if ($directoryIndex -lt 0 -or $args[$directoryIndex + 1] -ne '/') {
            throw 'A Windows drive working directory reached the WSL startup boundary.'
        }
        $boundary.lastDistribution = $args[1]; $boundary.boots++
    }
    if ('whoami' -in $args) { return 'researcher' }
    if ('printenv' -in $args) { return '/home/researcher' }
    if ('test' -in $args) { return }
    if ('--version' -in $args) { return 'uv 0.12.20' }
    if ('wslpath' -in $args) {
        $path = [string]$args[-1]
        if ($path.Contains('\') -or $path -notmatch '^[A-Za-z]:/') {
            throw 'WSL paths must use forward slashes to survive native argument parsing.'
        }
        return ('/mnt/' + $path.Substring(0,1).ToLowerInvariant() + $path.Substring(2))
    }
    if ('bash' -in $args) {
        if ($args[-2] -ne '/home/researcher/.local/share/opendde-workbench/app') {
            throw 'Python must be installed inside the Linux filesystem.'
        }
        if ($args[-1] -notlike '/mnt/*/downloads') { throw 'WSL must receive the verified local release files.' }
        $boundary.installations++
        return 'Installed test boundary'
    }
    throw ('Unexpected WSL invocation: ' + ($args -join ' '))
}
function global:Invoke-WebRequest {
    param([string]$Uri, [string]$OutFile, [switch]$UseBasicParsing, [int]$TimeoutSec)
    $boundary.downloads++
    $name = $Uri.Split('/')[-1]
    Copy-Item -LiteralPath (Join-Path $fixtures $name) -Destination $OutFile
    if ($boundary.corrupt -and $name.EndsWith('.whl')) { Add-Content -LiteralPath $OutFile -Value 'corrupted' }
}
try {
    foreach ($limited in @('installation','backing')) {
        $boundary.free = if ($limited -eq 'installation') { 0 } else { 32GB }
        $boundary.backingFree = if ($limited -eq 'backing') { 0 } else { 32GB }
        $limitedTarget = $target + " low $limited"
        $denied = $false
        try { & (Join-Path $repository 'install.ps1') -Distribution WSL -LinuxUser researcher -InstallRoot $limitedTarget }
        catch { if ($_.Exception.Message -notlike 'At least 2 GiB free space is required*') { throw }; $denied=$true }
        if (!$denied -or $boundary.boots -or $boundary.downloads) { throw 'Low physical capacity reached WSL startup or downloads.' }
    }
    $boundary.free = 32GB
    $boundary.backingFree = 32GB
    New-Item -ItemType Directory -Path (Join-Path $target 'bin') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repository 'scripts/opendde.ps1') -Destination (Join-Path $target 'bin/opendde.ps1')
    & (Join-Path $repository 'install.ps1') -Distribution OpenDDE -LinuxUser researcher -InstallRoot $target
    foreach ($name in @('X-DDE.cmd', 'xdde.cmd', 'opendde.cmd')) {
        $launcher = Get-Content -LiteralPath (Join-Path $target "bin/$name") -Raw
        if (!$launcher.Contains('%~dp0xdde-launcher.ps1') -or !$launcher.Contains('%*')) {
            throw "Launcher does not forward arguments to the shared implementation: $name"
        }
    }
    if (Test-Path -LiteralPath (Join-Path $target 'bin/opendde.ps1')) { throw 'Legacy bridge still shadows the opendde command.' }
    foreach ($alias in @('X-DDE', 'xdde', 'opendde')) {
        $command = Get-Command $alias
        if ($command.CommandType -ne 'Application' -or $command.Source -ne (Join-Path $target "bin/$alias.cmd")) { throw "Alias does not resolve to the command launcher: $alias" }
    }
    if ($env:TEMP -ne (Join-Path $target 'tmp') -or $env:TMP -ne $env:TEMP) { throw 'Installer temporary files are outside the selected application root.' }
    $config = Get-Content -LiteralPath (Join-Path $target 'bin/workbench.json') -Raw | ConvertFrom-Json
    if ($config.user -ne 'researcher' -or $config.distribution -ne 'OpenDDE') {
        throw 'WSL account configuration was not persisted.'
    }
    & (Join-Path $repository 'install.ps1') -InstallRoot $target
    if ($boundary.installations -ne 2) { throw 'Upgrade did not reuse the saved WSL distribution and account.' }
    $sharedTarget = $target + ' shared workspace'
    & (Join-Path $repository 'install.ps1') -InstallRoot $sharedTarget
    $sharedConfig = Get-Content -LiteralPath (Join-Path $sharedTarget 'bin/workbench.json') -Raw | ConvertFrom-Json
    if ($sharedConfig.distribution -ne 'WSL' -or $boundary.lastDistribution -ne 'WSL') { throw 'Fresh application setup did not reuse the existing shared WSL environment.' }
    & (Join-Path $repository 'install.ps1') -InstallRoot $sharedTarget
    if ($boundary.installations -ne 4 -or $boundary.lastDistribution -ne 'WSL') { throw 'Shared-workspace upgrade changed its saved distribution.' }
    $guardTarget = $target + ' retained disk'
    $retainedDisk = Join-Path $guardTarget 'WSL/ext4.vhdx'
    New-Item -ItemType Directory -Path (Split-Path $retainedDisk) -Force | Out-Null
    [IO.File]::WriteAllText($retainedDisk, 'Retained user disk')
    $boundary.distributions = @()
    $guarded = $false
    try {
        & (Join-Path $repository 'install.ps1') -Distribution Ubuntu-24.04 -InstallRoot $guardTarget
    } catch {
        if ($_.Exception.Message -notlike 'The shared Linux disk already exists.*') { throw }
        $guarded = $true
    }
    if (!$guarded -or [IO.File]::ReadAllText($retainedDisk) -ne 'Retained user disk' -or $boundary.installations -ne 4) { throw 'Existing shared disk was not preserved.' }
    $boundary.distributions = @('OpenDDE','WSL')
    $boundary.corrupt = $true
    $rejected = $false
    try {
        & (Join-Path $repository 'install.ps1') -Distribution OpenDDE -LinuxUser researcher -InstallRoot ($target + ' corrupted')
    } catch {
        if ($_.Exception.Message -notlike 'Release checksum mismatch:*') { throw }
        $rejected = $true
    }
    if (!$rejected -or $boundary.installations -ne 4) { throw 'Corrupt release reached the installation boundary.' }
    $boundary.corrupt = $false
    $config.home = '/srv/wsl/data/retained-study-home'
    $config | Add-Member -NotePropertyName network_proxy -NotePropertyValue 'http://127.0.0.1:7890'
    $config | Add-Member -NotePropertyName install_build_network -NotePropertyValue 'host'
    $config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'bin/workbench.json') -Encoding UTF8
    & (Join-Path $repository 'install.ps1') -InstallRoot $target
    $retainedConfig = Get-Content -LiteralPath (Join-Path $target 'bin/workbench.json') -Raw | ConvertFrom-Json
    if ($retainedConfig.home -ne $config.home -or $retainedConfig.network_proxy -ne $config.network_proxy -or $retainedConfig.install_build_network -ne 'host') {
        throw 'Upgrading discarded the existing study home, application proxy or explicit installer network.'
    }
    Write-Output 'Windows installer paths, verified local files, corruption rejection, configuration and aliases passed.'
} finally {
    [Environment]::SetEnvironmentVariable('Path', $previousPath, 'User')
    $env:TEMP = $previousTemp
    $env:TMP = $previousTmp
    Remove-Item Function:\wsl.exe, Function:\Invoke-WebRequest, Function:\Get-Volume, Function:\Get-ItemProperty
}
