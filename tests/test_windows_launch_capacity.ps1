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
param([string]$Launcher,[string]$Marker,[string]$Command,[switch]$Running)
function global:Get-Volume { param([string]$FilePath); [pscustomobject]@{SizeRemaining=0;DriveLetter='D'} }
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
function Invoke-LauncherBoundary([string]$Command,[string]$Marker,[switch]$Running) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $powershell
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @('-NoLogo','-NoProfile','-NonInteractive','-File',$wrapper,$launcher,$Marker,$Command)) {
        $start.ArgumentList.Add($argument)
    }
    if ($Running) { $start.ArgumentList.Add('-Running') }
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
}
Write-Output 'Low physical capacity blocks startup; offline controls do not boot WSL and running controls do not create temporary storage.'
