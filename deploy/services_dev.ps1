# Services de développement d'ALLAKRO (Docker) : Redis (cache des limites de débit) et Mailpit (boîte de réception des e-mails de test).
#   .\services_dev.ps1            démarre (crée au besoin) les deux conteneurs
#   .\services_dev.ps1 -Etat      affiche leur état
# Redis : 127.0.0.1:6379, protégé par mot de passe (CACHE_LOCATION de backend/.env) ; Mailpit : SMTP 127.0.0.1:1025, web http://localhost:8025.
# Les conteneurs redémarrent seuls avec Docker Desktop (--restart unless-stopped). Sans Redis, l'application continue de fonctionner.
param([switch]$Etat)

$docker = 'C:\Users\HP\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe'
$racine = Split-Path -Parent $PSScriptRoot
if ($Etat) { & $docker ps -a --filter name=allakro --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'; return }

& $docker version --format '{{.Server.Version}}' *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker Desktop n'est pas démarré : lancez-le puis relancez ce script."; exit 1 }

# Mot de passe Redis : celui de CACHE_LOCATION (redis://:MOT_DE_PASSE@127.0.0.1:6379/1)
$ligne = (Select-String -Path (Join-Path $racine 'backend\.env') -Pattern '^CACHE_LOCATION=redis://:([^@]*)@').Matches
if (-not $ligne) { Write-Host 'CACHE_LOCATION absent de backend/.env : configurez-le (voir deploy/.env.production.exemple).'; exit 1 }
$motDePasse = $ligne[0].Groups[1].Value

if (-not (& $docker ps -a --filter name=allakro-redis --format '{{.Names}}')) {
  & $docker run -d --name allakro-redis --restart unless-stopped -p 127.0.0.1:6379:6379 -v allakro-redis-data:/data redis:7-alpine `
    redis-server --requirepass $motDePasse --appendonly yes --maxmemory 128mb --maxmemory-policy allkeys-lru
} else { & $docker start allakro-redis | Out-Null }
if (-not (& $docker ps -a --filter name=allakro-mail --format '{{.Names}}')) {
  & $docker run -d --name allakro-mail --restart unless-stopped -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit
} else { & $docker start allakro-mail | Out-Null }
& $docker ps --filter name=allakro --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
