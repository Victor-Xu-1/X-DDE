$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$taskDistribution = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__DISTRIBUTION__')) | ConvertFrom-Json
$taskEntries = @(
    Get-ChildItem -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' |
        ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath } |
        Where-Object { $_.DistributionName -ceq $taskDistribution }
)
if ($taskEntries.Count -ne 1 -or -not $taskEntries[0].BasePath) { throw 'Cannot identify the registered WSL backing storage.' }
$taskVolumes = @(Get-Volume -FilePath $taskEntries[0].BasePath)
if ($taskVolumes.Count -ne 1) { throw 'Cannot identify the WSL backing volume.' }
$taskLabel = if ($taskVolumes[0].DriveLetter) { [string]$taskVolumes[0].DriveLetter + ':' } else { 'Host storage' }
@{location=$taskLabel; free_bytes=[uint64]$taskVolumes[0].SizeRemaining} | ConvertTo-Json -Compress
