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
param([string]$Launcher,[string]$Marker,[string]$Command)
function global:Get-Volume { param([string]$FilePath); [pscustomobject]@{SizeRemaining=0;DriveLetter='D'} }
function global:Get-ItemProperty {
    param([string]$Path,$ErrorAction)
    [pscustomobject]@{DistributionName='isolated-Windows-boundary';BasePath=(Split-Path $Launcher -Parent)}
}
function global:wsl.exe {
    $global:LASTEXITCODE=0
    if ($args[0] -eq '--list' -and '--running' -in $args) { return @() }
    [IO.File]::WriteAllText($Marker,($args -join ' '))
    throw 'Unsafe native WSL invocation reached the isolated boundary.'
}
& $Launcher $Command '--no-browser'
'@ | Set-Content -LiteralPath $wrapper -Encoding utf8
$powershell = (Get-Process -Id $PID).Path
function Invoke-LauncherBoundary([string]$Command,[string]$Marker) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $powershell
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @('-NoLogo','-NoProfile','-NonInteractive','-File',$wrapper,$launcher,$Marker,$Command)) {
        $start.ArgumentList.Add($argument)
    }
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
Write-Output 'Low physical capacity blocks startup; offline status and close do not boot WSL.'
