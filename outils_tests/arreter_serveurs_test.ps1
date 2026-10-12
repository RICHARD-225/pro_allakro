# Arrête uniquement les serveurs de test (8001, 5180, 9333) après vérification de leur ligne de commande : jamais 8000 ni 5173.
foreach ($port in 8001, 5180, 9333) {
  $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
    $ligne = [string]$p.CommandLine
    if ($ligne -like '*127.0.0.1:8001*' -or $ligne -like '*--port 5180*' -or $ligne -like '*remote-debugging-port=9333*') {
      Stop-Process -Id $c.OwningProcess -Force
      "arrêté : $port"
    }
  }
}
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*remote-debugging-port=9333*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
