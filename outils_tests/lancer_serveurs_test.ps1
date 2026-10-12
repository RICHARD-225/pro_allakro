# Lance les serveurs de test (jamais ceux de l'utilisateur : ports 8000 et 5173) :
#   API Django sur 8001 (base allakro_demo, Redis base n° 2), interface sur 5180, Edge sans fenêtre sur 9333.
# Usage : .\lancer_serveurs_test.ps1 [-Production]   (-Production : interface = build de production servi par « vite preview », sous sa CSP)
param([switch]$Production)

$racine = Split-Path -Parent $PSScriptRoot
$python = Join-Path $racine 'env\Scripts\python.exe'
$env:PYTHONUTF8 = '1'
$env:DB_NAME = 'allakro_demo'
$env:CSRF_TRUSTED_ORIGINS = 'http://localhost:5180'
# Même Redis que l'application, mais la base n° 2 : les compteurs des tests ne se mélangent pas à ceux du développement
$location = (Select-String -Path (Join-Path $racine 'backend\.env') -Pattern '^CACHE_LOCATION=(.*)$').Matches[0].Groups[1].Value
if ($location) { $env:CACHE_LOCATION = $location -replace '/1$', '/2' }
Start-Process -FilePath $python -ArgumentList 'manage.py', 'runserver', '127.0.0.1:8001', '--noreload' -WorkingDirectory (Join-Path $racine 'backend') -WindowStyle Hidden

$env:VITE_BACKEND_URL = 'http://127.0.0.1:8001'
$argsVite = if ($Production) { @('node_modules/vite/bin/vite.js', 'preview', '--port', '5180', '--strictPort') } else { @('node_modules/vite/bin/vite.js', '--port', '5180', '--strictPort') }
Start-Process -FilePath 'node' -ArgumentList $argsVite -WorkingDirectory (Join-Path $racine 'frontend') -WindowStyle Hidden

$profil = Join-Path $env:TEMP 'edge-profil-allakro'
Start-Process 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList '--headless=new', '--remote-debugging-port=9333', '--no-first-run', '--disable-gpu', "--user-data-dir=$profil", 'about:blank' -WindowStyle Hidden
Start-Sleep -Seconds 12
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 8001, 5180, 9333 } | Select-Object LocalPort, OwningProcess
