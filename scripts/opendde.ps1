$ErrorActionPreference = 'Stop'
try {
    $config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'workbench.json') -Raw | ConvertFrom-Json
    $windowsRoot = Split-Path $PSScriptRoot -Parent
    $windowsTemp = Join-Path $windowsRoot 'tmp'
    New-Item -ItemType Directory -Path $windowsTemp -Force | Out-Null
    $env:TEMP = $windowsTemp
    $env:TMP = $windowsTemp
    $arguments = @($args)
    $command = if ($arguments.Count) { "$($arguments[0])".ToLowerInvariant() } else { 'ui' }
    $action = if ($arguments.Count -gt 1) { "$($arguments[1])".ToLowerInvariant() } else { '' }
    $launch = $command -in @('ui','dashboard','start','restart','setup') -and $action -notin @('stop','close','status','system')
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
