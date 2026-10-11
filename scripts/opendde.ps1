$ErrorActionPreference = 'Stop'
try {
    $config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'workbench.json') -Raw | ConvertFrom-Json
    $windowsRoot = Split-Path $PSScriptRoot -Parent
    $arguments = @($args)
    $command = if ($arguments.Count) { "$($arguments[0])".ToLowerInvariant() } else { 'ui' }
    $action = if ($arguments.Count -gt 1) { "$($arguments[1])".ToLowerInvariant() } else { '' }
    $launch = $command -in @('ui','dashboard','start','restart','setup') -and $action -notin @('stop','close','status','system')
    $readControl = $command -in @('status','stop','close') -or ($command -in @('ui','dashboard') -and $action -in @('status','stop','close'))
    if ($readControl) {
        $taskRunning = @((& wsl.exe --list --running --quiet) -replace "`0", '' | ForEach-Object { $_.Trim() })
        if ($LASTEXITCODE -ne 0) { throw 'Cannot verify the WSL running state.' }
        if ($config.distribution -notin $taskRunning) {
            if ($command -eq 'status' -or $action -eq 'status') {
                @{running=$false;distribution=$config.distribution} | ConvertTo-Json -Compress
            } else { Write-Output 'X-DDE is already stopped.' }
            exit 0
        }
    }
    if (-not $readControl) {
        $taskVolumes = @(Get-Volume -FilePath $windowsRoot)
        $taskRegistration = @(Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss\*' -ErrorAction SilentlyContinue | Where-Object DistributionName -eq $config.distribution)
        if ($taskRegistration.Count -ne 1 -or -not $taskRegistration[0].BasePath) {
            throw 'Cannot verify the registered WSL storage location. Check the application configuration.'
        }
        $taskVolumes += @(Get-Volume -FilePath $taskRegistration[0].BasePath)
        if ($taskVolumes.Count -ne 2 -or @($taskVolumes | Where-Object SizeRemaining -lt 2GB).Count) {
            throw 'At least 2 GiB free disk space is required before starting X-DDE. Free space on the storage drive and retry.'
        }
    }
    $windowsTemp = Join-Path $windowsRoot 'tmp'
    New-Item -ItemType Directory -Path $windowsTemp -Force | Out-Null
    $env:TEMP = $windowsTemp
    $env:TMP = $windowsTemp
    $open = $launch -and '--no-browser' -notin $arguments
    if ($launch -and '--no-browser' -notin $arguments) { $arguments += '--no-browser' }
    $output = & wsl.exe -d $config.distribution -u $config.user -- env "WB_HOME=$($config.home)" "PATH=$($config.prefix)/bin:/usr/local/bin:/usr/bin:/bin" "$($config.prefix)/bin/xdde" @arguments
    $result = $LASTEXITCODE
    $output | ForEach-Object { Write-Output $_ }
    if ($result -eq 0 -and $open) {
        $line = $output | Where-Object { $_ -match '^X-DDE [^:]+: (http://127\.0\.0\.1:[0-9]+/)$' } | Select-Object -Last 1
        if ($line -match '^X-DDE [^:]+: (http://127\.0\.0\.1:[0-9]+/)$') { Start-Process $Matches[1] }
    }
    exit $result
} catch { Write-Error $_; exit 1 }
