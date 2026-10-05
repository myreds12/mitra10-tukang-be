# =========================================================
# auto-deploy-be.ps1
# Auto deploy untuk Backend (tukangapi) di server THESEUS
# Alur: cek update -> (install jika perlu) -> (prisma jika perlu)
#       -> build -> copy web.config ke dist -> pm2 restart -> health check
# =========================================================

$ErrorActionPreference = "Stop"

# ---------- KONFIGURASI (SESUAIKAN INI) ----------
$AppDir       = "D:\Applications\tukangapi"                     # path project BE di server theseus
$Branch       = "main"
$PmName       = "tukangapi"                             # nama proses pm2 BE
$HealthUrl    = "http://localhost:3000/health"          # ganti sesuai endpoint health check BE
$LogFile      = "D:\Applications\deploy\deploy-be.log"
$Lock         = "D:\Applications\deploy\deploy-be.lock"
$WebConfigSrc = "D:\Applications\tukangapi\web.config"           # master web.config, DI LUAR folder dist
$DistDir      = "D:\Applications\tukangapi\dist"                 # folder hasil build

# Pilih strategi prisma: "push" (db push, cepat tapi bisa destruktif)
# atau "migrate" (migrate deploy, lebih aman kalau sudah pakai file migration)
$PrismaStrategy = "push"    # ganti ke "migrate" kalau sudah pakai folder prisma/migrations
# ---------------------------------------------------

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

    if ($local -eq $remote) {
        Log "Tidak ada commit baru. Skip deploy."
        exit 0
    }

    Log "======================================================"
    Log "Ada update: $local -> $remote"

    # Cek file apa saja yang berubah
    $changedFiles  = git diff --name-only $local $remote
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
        npm run build
        Copy-WebConfig
        pm2 restart $PmName --update-env

        Log "Rollback selesai, BE kembali ke versi lama"
    }
}
finally {
    Remove-Item $Lock -Force -ErrorAction SilentlyContinue
}