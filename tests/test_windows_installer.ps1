$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$target = Join-Path ([IO.Path]::GetTempPath()) ('X DDE installer ' + [guid]::NewGuid())
$previousPath = [Environment]::GetEnvironmentVariable('Path', 'User')
# Isolate the external WSL/download boundaries; run the real installer and file writes.
function global:wsl.exe {
    $global:LASTEXITCODE = 0
    if ($args[0] -eq '--list') { return 'OpenDDE' }
    if ('whoami' -in $args) { return 'researcher' }
    if ('printenv' -in $args) { return '/home/researcher' }
    if ('wslpath' -in $args) {
        $path = [string]$args[-1]
        if ($path.Contains('\') -or $path -notmatch '^[A-Za-z]:/') {
            throw 'WSL paths must use forward slashes to survive native argument parsing.'
        }
        return ('/mnt/' + $path.Substring(0,1).ToLowerInvariant() + $path.Substring(2))
    }
    if ('bash' -in $args) {
        if ($args[-1] -ne '/home/researcher/.local/share/opendde-workbench/app') {
            throw 'Python must be installed inside the Linux filesystem.'
        }
        return 'Installed test boundary'
    }
    throw ('Unexpected WSL invocation: ' + ($args -join ' '))
}
function global:Invoke-WebRequest {
    param([string]$Uri, [string]$OutFile)
    if ($Uri.EndsWith('/opendde.ps1')) {
        Copy-Item -LiteralPath (Join-Path $repository 'scripts/opendde.ps1') -Destination $OutFile
    } else {
        Set-Content -LiteralPath $OutFile -Value '# Download boundary'
    }
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
    Write-Output 'Windows installer argument, location, configuration and alias checks passed.'
} finally {
    [Environment]::SetEnvironmentVariable('Path', $previousPath, 'User')
    Remove-Item Function:\wsl.exe, Function:\Invoke-WebRequest
}
