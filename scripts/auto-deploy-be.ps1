# =========================================================
# scripts/deploy/auto-deploy-be.ps1
# Auto deploy untuk Backend (tukangapi) di server THESEUS
# Dipanggil oleh GitHub Actions (deploy.yml)
# Alur: pull -> (install jika perlu) -> (prisma jika perlu)
#       -> build -> copy web.config ke dist -> pm2 restart -> health check
# =========================================================

$ErrorActionPreference = "Stop"

# ---------- DIAMBIL DARI ENV WORKFLOW (kalau ada), fallback ke default ----------
$AppDir  = if ($env:APP_DIR) { $env:APP_DIR } else { "D:\Applications\tukangapi" }
$Branch  = if ($env:BRANCH)  { $env:BRANCH }  else { "main" }
$PmName  = if ($env:PM_NAME) { $env:PM_NAME } else { "tukangapi" }
$HealthUrl    = if ($env:HEALTH_URL)     { $env:HEALTH_URL }     else { "http://localhost:3000/health" }
$WebConfigSrc = if ($env:WEB_CONFIG_SRC) { $env:WEB_CONFIG_SRC } else { "D:\Applications\tukangapi\web.config" }
$DistDir      = if ($env:DIST_DIR)       { $env:DIST_DIR }       else { "D:\Applications\tukangapi\dist" }
$PrismaStrategy = if ($env:PRISMA_STRATEGY) { $env:PRISMA_STRATEGY } else { "push" }

# ---------- KONFIGURASI LOG (SESUAIKAN SEKALI SAJA) ----------
$LogDir  = "D:\Applications\deploy"
$LogFile = Join-Path $LogDir "deploy-be.log"
$Lock    = Join-Path $LogDir "deploy-be.lock"
# ---------------------------------------------------

# Pastikan folder log ada, auto-create kalau belum
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Log($msg) {
    $line = "$(Get-Date -Format 's') | $msg"
    $line | Tee-Object -FilePath $LogFile -Append
}

function Run($cmd) {
    Log "RUN: $cmd"
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) {
        throw "Command gagal (exit $LASTEXITCODE): $cmd"
    }
}

function Copy-WebConfig {
    if (Test-Path $WebConfigSrc) {
        Copy-Item $WebConfigSrc -Destination $DistDir -Force
        Log "web.config ditempatkan ke $DistDir"
    } else {
        Log "PERINGATAN: web.config master tidak ditemukan di $WebConfigSrc"
    }
}

# Cegah 2 proses deploy jalan bersamaan
if (Test-Path $Lock) {
    Log "Lock file ada, deploy sebelumnya kemungkinan masih jalan. Skip."
    exit 0
}
New-Item $Lock -ItemType File -Force | Out-Null

try {
    Set-Location $AppDir

    Run "git fetch origin $Branch"
    $local  = (git rev-parse HEAD).Trim()
    $remote = (git rev-parse "origin/$Branch").Trim()

    Log "======================================================"
    Log "Deploy BE dipicu oleh GitHub Actions ($local -> $remote)"

    $changedFiles  = if ($local -ne $remote) { git diff --name-only $local $remote } else { @() }
    $depsChanged   = $changedFiles -match "package-lock\.json" -or $changedFiles -match "^package\.json$"
    $prismaChanged = $changedFiles -match "prisma/schema\.prisma" -or $changedFiles -match "^prisma/migrations/"

    if ($depsChanged)   { Log "Terdeteksi perubahan pada package.json/package-lock.json" } else { Log "Tidak ada perubahan dependencies" }
    if ($prismaChanged) { Log "Terdeteksi perubahan pada schema/migration Prisma" } else { Log "Tidak ada perubahan Prisma" }

    try {
        Run "git reset --hard origin/$Branch"

        if ($depsChanged) {
            Log "Menjalankan npm ci (dependencies berubah)"
            Run "npm ci"
        } else {
            Log "Skip npm ci (dependencies tidak berubah)"
        }

        if ($prismaChanged) {
            Log "Menjalankan prisma generate"
            Run "npx prisma generate"

            if ($PrismaStrategy -eq "migrate") {
                Log "Menjalankan prisma migrate deploy"
                Run "npx prisma migrate deploy"
            } else {
                Log "Menjalankan prisma db push"
                Run "npx prisma db push"
            }
        } else {
            Log "Skip prisma generate/push (schema tidak berubah)"
        }

        Log "Build backend..."
        $env:CI = "false"     # cegah build gagal gara-gara warning ESLint dianggap error
        Run "npm run build"

        Copy-WebConfig

        Log "Restart proses pm2: $PmName"
        Run "pm2 restart $PmName --update-env"

        Log "Menunggu 8 detik sebelum health check..."
        Start-Sleep -Seconds 8

        $res = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 15
        if ($res.StatusCode -ne 200) {
            throw "Health check gagal, status code: $($res.StatusCode)"
        }

        Log "DEPLOY BE SUKSES ($local -> $remote)"
    }
    catch {
        Log "DEPLOY BE GAGAL: $($_.Exception.Message)"
        Log "Rollback ke commit sebelumnya: $local"

        git reset --hard $local
        if ($depsChanged) { npm ci }
        if ($prismaChanged) { npx prisma generate }
        $env:CI = "false"
        npm run build
        Copy-WebConfig
        pm2 restart $PmName --update-env

        Log "Rollback selesai, BE kembali ke versi lama"
        throw   # lempar lagi errornya supaya job Actions ikut ditandai gagal (merah)
    }
}
finally {
    Remove-Item $Lock -Force -ErrorAction SilentlyContinue
}