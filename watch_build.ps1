$log = 'C:\Users\admin\AppData\Local\Temp\eas_build_watch.log'
Set-Content -Path $log -Value ("watch started " + (Get-Date -Format HH:mm:ss))
Set-Location 'c:\xampp\htdocs\Final-Final-Project-G\spartan-g\apps\mobile'
for ($i = 1; $i -le 60; $i++) {
  Start-Sleep -Seconds 60
  $j = eas build:list --platform android --limit 1 --json --non-interactive 2>$null | ConvertFrom-Json
  $b = $j[0]
  $line = (Get-Date -Format HH:mm:ss) + ' status=' + $b.status
  if ($b.error) { $line += ' ERROR=' + ($b.error | ConvertTo-Json -Depth 3) }
  if ($b.artifacts -and $b.artifacts.buildUrl) { $line += ' APK=' + $b.artifacts.buildUrl }
  Add-Content -Path $log -Value $line
  if ($b.status -eq 'FINISHED' -or $b.status -eq 'ERRORED' -or $b.status -eq 'CANCELED') { break }
}
Add-Content -Path $log -Value ('WATCH_DONE status=' + $b.status)