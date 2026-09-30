$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$target = Join-Path ([IO.Path]::GetTempPath()) ('X DDE installer ' + [guid]::NewGuid())
$previousPath = [Environment]::GetEnvironmentVariable('Path', 'User')
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
$boundary = @{ corrupt = $false; installations = 0 }
# Isolate the external WSL/download boundaries; run the real installer and file writes.
function global:wsl.exe {
    $global:LASTEXITCODE = 0
    if ($args[0] -eq '--list') { return 'OpenDDE' }
    if ('whoami' -in $args) { return 'researcher' }
    if ('printenv' -in $args) { return '/home/researcher' }
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
    param([string]$Uri, [string]$OutFile)
    $name = $Uri.Split('/')[-1]
    Copy-Item -LiteralPath (Join-Path $fixtures $name) -Destination $OutFile
    if ($boundary.corrupt -and $name.EndsWith('.whl')) { Add-Content -LiteralPath $OutFile -Value 'corrupted' }
}
try {
    & (Join-Path $repository 'install.ps1') -Distribution OpenDDE -LinuxUser researcher -InstallRoot $target
    foreach ($name in @('X-DDE.cmd', 'xdde.cmd', 'opendde.cmd')) {
        $launcher = Get-Content -LiteralPath (Join-Path $target "bin/$name") -Raw
        if (!$launcher.Contains('%~dp0opendde.ps1') -or !$launcher.Contains('%*')) {
            throw "Launcher does not forward arguments to the shared implementation: $name"
        }
    }
    $config = Get-Content -LiteralPath (Join-Path $target 'bin/workbench.json') -Raw | ConvertFrom-Json
    if ($config.user -ne 'researcher' -or $config.distribution -ne 'OpenDDE') {
        throw 'WSL account configuration was not persisted.'
    }
    $boundary.corrupt = $true
    $rejected = $false
    try {
        & (Join-Path $repository 'install.ps1') -Distribution OpenDDE -LinuxUser researcher -InstallRoot ($target + ' corrupted')
    } catch {
        if ($_.Exception.Message -notlike 'Release checksum mismatch:*') { throw }
        $rejected = $true
    }
    if (!$rejected -or $boundary.installations -ne 1) { throw 'Corrupt release reached the installation boundary.' }
    Write-Output 'Windows installer paths, verified local files, corruption rejection, configuration and aliases passed.'
} finally {
    [Environment]::SetEnvironmentVariable('Path', $previousPath, 'User')
    Remove-Item Function:\wsl.exe, Function:\Invoke-WebRequest
}
