$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$target = Join-Path ([IO.Path]::GetTempPath()) ('X DDE launch capacity ' + [guid]::NewGuid())
$bin = Join-Path $target 'bin'
New-Item -ItemType Directory -Path $bin -Force | Out-Null
$launcher = Join-Path $bin 'xdde-launcher.ps1'
Copy-Item -LiteralPath (Join-Path $repository 'scripts/opendde.ps1') -Destination $launcher
@{distribution='isolated-Windows-boundary';user='researcher';home='/data';prefix='/environment'} |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $bin 'workbench.json') -Encoding utf8
$wrapper = Join-Path $target 'boundary.ps1'
@'
param([string]$Launcher,[string]$Marker,[string]$Command,[switch]$Running,[switch]$Available)
function global:Get-Volume {
    param([string]$FilePath)
    [pscustomobject]@{SizeRemaining=$(if ($Available) { 32GB } else { 0 });DriveLetter='D'}
}
function global:Get-ItemProperty {
    param([string]$Path,$ErrorAction)
    [pscustomobject]@{DistributionName='isolated-Windows-boundary';BasePath=(Split-Path $Launcher -Parent)}
}
function global:wsl.exe {
    $global:LASTEXITCODE=0
    if ($args[0] -eq '--list' -and '--running' -in $args) {
        if ($Running) { return 'isolated-Windows-boundary' }
        return @()
    }
    [IO.File]::WriteAllText($Marker,($args -join ' '))
    if ($Running -and $args[0] -eq '-d' -and $args[1] -eq 'isolated-Windows-boundary') {
        return '{"running":true,"distribution":"isolated-Windows-boundary"}'
    }
    throw 'Unsafe native WSL invocation reached the isolated boundary.'
}
& $Launcher $Command '--no-browser'
'@ | Set-Content -LiteralPath $wrapper -Encoding utf8
$powershell = (Get-Process -Id $PID).Path
function Invoke-LauncherBoundary([string]$Command,[string]$Marker,[switch]$Running,[switch]$Available) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $powershell
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.WorkingDirectory = $target
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @('-NoLogo','-NoProfile','-NonInteractive','-File',$wrapper,$launcher,$Marker,$Command)) {
        $start.ArgumentList.Add($argument)
    }
    if ($Running) { $start.ArgumentList.Add('-Running') }
    if ($Available) { $start.ArgumentList.Add('-Available') }
    $process = [Diagnostics.Process]::Start($start)
    try {
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (!$process.WaitForExit(15000)) { $process.Kill($true); throw 'Isolated launcher exceeded its deadline.' }
        return @{exit=$process.ExitCode;output=$stdout.GetAwaiter().GetResult();error=$stderr.GetAwaiter().GetResult()}
    } finally { $process.Dispose() }
}
foreach ($command in @('UI','dashboard','setup','restart')) {
    $marker = Join-Path $target ($command + '.native-call')
    $result = Invoke-LauncherBoundary $command $marker
    if ($result.exit -eq 0 -or (Test-Path -LiteralPath $marker)) { throw "Low disk startup was not blocked: $command" }
    if (($result.output + $result.error) -notmatch 'free disk space') { throw 'Startup failure did not identify the disk problem.' }
}
foreach ($command in @('status','stop','close')) {
    $marker = Join-Path $target ($command + '.native-call')
    $result = Invoke-LauncherBoundary $command $marker
    if ($result.exit -ne 0 -or (Test-Path -LiteralPath $marker)) { throw "Read-only offline control booted WSL: $command" }
    if ($command -eq 'status' -and ($result.output | ConvertFrom-Json).running -ne $false) { throw 'Offline status was not truthful.' }
}
foreach ($command in @('STATUS','Stop','CLOSE')) {
    $marker = Join-Path $target ($command + '.running-native-call')
    $result = Invoke-LauncherBoundary $command $marker -Running
    if ($result.exit -ne 0 -or !(Test-Path -LiteralPath $marker)) { throw "Running control did not reach the registered X-DDE CLI: $command" }
    if (Test-Path -LiteralPath (Join-Path $target 'tmp')) { throw 'Status or close created temporary storage on a full drive.' }
    $invocation = [IO.File]::ReadAllText($marker)
    if ($invocation -notmatch '/environment/bin/xdde' -or $invocation -notmatch "(?i) $command ") { throw 'Running control was not forwarded unchanged to the existing CLI.' }
    # PowerShell function boundaries consume --; native wsl.exe retains it.
    if ($invocation -notmatch ' --cd / (?:-- )?env ') { throw 'Running control inherited the caller Windows drive directory.' }
}
foreach ($command in @('UI','DASHBOARD','START')) {
    $marker = Join-Path $target ($command + '.available-native-call')
    $result = Invoke-LauncherBoundary $command $marker -Running -Available
    if ($result.exit -ne 0 -or !(Test-Path -LiteralPath $marker)) { throw "Available startup failed: $command" }
    $invocation = [IO.File]::ReadAllText($marker)
    if ($invocation -notmatch ' --cd / (?:-- )?env ' -or $invocation -notmatch '/environment/bin/xdde') {
        throw 'Startup did not enter the registered distribution from an explicit Linux directory.'
    }
}
Write-Output 'Low physical capacity blocks startup; offline controls do not boot WSL and running controls do not create temporary storage.'
$configuration = Join-Path $bin 'workbench.json'
$value = Get-Content -LiteralPath $configuration -Raw | ConvertFrom-Json
$value | Add-Member -NotePropertyName network_proxy -NotePropertyValue 'http://127.0.0.1:7890'
$value | ConvertTo-Json | Set-Content -LiteralPath $configuration -Encoding utf8
$marker = Join-Path $target 'proxy.native-call'
$result = Invoke-LauncherBoundary 'status' $marker -Running
if ($result.exit -ne 0) { throw 'Configured application proxy blocked normal status control.' }
$forwarded = [IO.File]::ReadAllText($marker)
if ($forwarded -notmatch 'HTTPS_PROXY=http://127.0.0.1:7890' -or
    $forwarded -notmatch 'http_proxy=http://127.0.0.1:7890' -or
    $forwarded -notmatch 'NO_PROXY=localhost,127.0.0.1,::1') {
    throw 'The application proxy or local-service bypass was not forwarded to WSL.'
}
if ($forwarded -match 'WB_INSTALL_BUILD_NETWORK=host') { throw 'A proxy alone silently enabled host build networking.' }
$value | Add-Member -NotePropertyName install_build_network -NotePropertyValue 'HOST'
$value | ConvertTo-Json | Set-Content -LiteralPath $configuration -Encoding utf8
$marker = Join-Path $target 'host-build-network.native-call'
$result = Invoke-LauncherBoundary 'UI' $marker -Running -Available
if ($result.exit -ne 0 -or [IO.File]::ReadAllText($marker) -notmatch 'WB_INSTALL_BUILD_NETWORK=host') {
    throw 'The explicitly configured installer network was not retained on startup.'
}
$value.install_build_network = 'default'
$value | ConvertTo-Json | Set-Content -LiteralPath $configuration -Encoding utf8
$marker = Join-Path $target 'default-build-network.native-call'
$result = Invoke-LauncherBoundary 'START' $marker -Running -Available
$forwarded = [IO.File]::ReadAllText($marker)
if ($result.exit -ne 0 -or $forwarded -notmatch 'WB_INSTALL_BUILD_NETWORK=default' -or $forwarded -match 'WB_INSTALL_BUILD_NETWORK=host') {
    throw 'An explicit default build network was overridden.'
}
$value.install_build_network = 'host --privileged'
$value | ConvertTo-Json | Set-Content -LiteralPath $configuration -Encoding utf8
$marker = Join-Path $target 'invalid-build-network.native-call'
$result = Invoke-LauncherBoundary 'UI' $marker -Running -Available
if ($result.exit -eq 0 -or (Test-Path -LiteralPath $marker)) { throw 'Invalid installer network reached WSL.' }
$value.install_build_network = 'host'
$value.network_proxy = 'http://127.0.0.1:7890/bad-path'
$value | ConvertTo-Json | Set-Content -LiteralPath $configuration -Encoding utf8
$marker = Join-Path $target 'invalid-proxy.native-call'
$result = Invoke-LauncherBoundary 'status' $marker -Running
if ($result.exit -eq 0 -or (Test-Path -LiteralPath $marker)) {
    throw 'Invalid network configuration reached native WSL execution.'
}
Write-Output 'Explicit installer networking and proxy transmission remain application-scoped; default and offline policies are preserved.'
