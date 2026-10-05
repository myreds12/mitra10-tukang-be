# Manual Verification — Poin 3 (PDF Bukti SP) + Poin 4 (PDF Surat Bebas Pelanggaran)

Scope: `mitra10-tukang-api` (backend) + `tukang` (frontend). Tanpa unit test/jest — verifikasi via curl + visual PDF.

## 1. Build & Boot

```bash
# Terminal 1 — backend
cd C:\Tukang\mitra10-tukang-api
npm run start:dev
# Tunggu sampai "Nest application successfully started" + "Listening on port <PORT>"

# Terminal 2 — frontend
cd C:\Tukang\tukang
npm start
# Tunggu sampai "Compiled successfully" + buka http://localhost:3000
```

Backend harus boot tanpa error setelah dependency injection `PdfService` + `ReportQueryHelper` di-resolve oleh `VendorSpModule`.

## 2. Seed Data Test (minimum)

Login ke Admin HO dulu (butuh token JWT di header Authorization). Endpoint login: `POST /auth/login`.

### 2.1 Vendor A — dengan pelanggaran (untuk Poin 3 + Poin 4 validasi error)
- Vendor ID: asumsi `1` (sesuaikan dengan data existing)
- Harus ada minimal 1 `vendor_violation_log` aktif di Q1 2025 (atau quarter lampau lain)
- Catat: `vendor_id`, `quarter`, `year`, jumlah violation

### 2.2 Vendor B — tanpa pelanggaran di quarter lampau (untuk Poin 4 success)
- Vendor ID: asumsi `2`
- Pastikan 0 `vendor_violation_log` aktif di Q1 2025
- Pastikan Q1 2025 < current quarter (kuartal lampau)

### 2.3 Vendor C — dengan pelanggaran di quarter berjalan (untuk Poin 4 validasi "ada pelanggaran")
- Vendor ID: asumsi `3`
- Punya 1 `vendor_violation_log` aktif di current quarter

## 3. Curl/Postman Command

### Poin 3 — PDF Bukti SP
```bash
curl -X POST http://localhost:3000/vendor-sp/penalty-receipt/export \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":1,"quarter":1,"year":2025}' \
  --output bukti-sp-vendor1.pdf

# Expected: HTTP 200, file PDF tersimpan sebagai bukti-sp-vendor1.pdf
# Filename header: Bukti_SP_<VendorName>_1_2025.pdf
```

Verifikasi filename dengan:
```bash
curl -X POST http://localhost:3000/vendor-sp/penalty-receipt/export \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>" \
  -H "Content-Type: application/json" \
  -D - \
  -d '{"vendor_id":1,"quarter":1,"year":2025}' \
  -o bukti-sp-vendor1.pdf 2>&1 | grep -i "content-disposition\|content-type"
```

Expected headers:
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="Bukti_SP_<VendorName>_1_2025.pdf"`

### Poin 4 — PDF Surat Bebas Pelanggaran (success)
```bash
# Vendor B (tanpa pelanggaran Q1 2025)
curl -X POST http://localhost:3000/vendor-sp/no-violation-certificate/export \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":2,"quarter":1,"year":2025}' \
  --output surat-bebas-vendor2.pdf
```

Expected: HTTP 200, filename `Surat_Bebas_Pelanggaran_<VendorName>_1_2025.pdf`, nomor surat `BEBAS-2025-0001` (atau sequence berikutnya kalau sudah pernah generate).

## 4. Checklist Visual PDF

### Poin 3 (Bukti SP)
Buka hasil PDF, cek:
- [ ] **Header**: "MITRA10" (logo placeholder) di pojok kiri atas + judul "BUKTI SURAT PERINGATAN (SP)" centered
- [ ] **Sub-header**: "Periode Q1 2025" terlihat
- [ ] **Section Informasi Vendor**: Nama Perusahaan, PIC, Status Vendor, Status SP terisi benar (tidak ada "-")
- [ ] **Section Ringkasan**: Tanggal Dokumen (YYYY-MM-DD), Total Order Kuartal, Total Order Pelanggaran, Total Poin Penalty, Alokasi Order Dikurangi
- [ ] **Section Rincian Pelanggaran**: Tabel dengan kolom Tanggal | Kode | Nama Pelanggaran | Order | Poin. Baris sesuai jumlah violation log aktif
- [ ] **Section Tanda Tangan**: 2 kolom (Admin HO di kiri, Vendor di kanan) dengan area garis ttd
- [ ] **Footer**: "Generated: YYYY-MM-DD HH:MM:SS UTC" di kiri + "Halaman X dari Y" di kanan
- [ ] **Encoding**: Tidak ada karakter rusak/menjadi kotak atau "?" — "Pelanggaran", "Quartal", "Tanggal", "Pengurangan" terbaca jelas
- [ ] **Layout rapi**: Tidak ada teks terpotong atau overflow

### Poin 4 (Surat Bebas Pelanggaran)
- [ ] **Header**: "MITRA10" + judul "SURAT KETERANGAN BEBAS PELANGGARAN"
- [ ] **Sub-header**: "Nomor: BEBAS-2025-0001    Periode: Q1 2025"
- [ ] **Section Informasi Vendor**: Nama Perusahaan, PIC, Email, Status Vendor
- [ ] **Section Keterangan**: Total Order Kuartal, Total Pelanggaran: "0 (nol)", Status SP: "NORMAL"
- [ ] **Kalimat resmi**: Paragraf "...tidak memiliki pelanggaran aktif pada periode Q1 2025..."
- [ ] **Section Tanda Tangan**: 1 kolom (Admin HO) dengan area garis ttd
- [ ] **Footer + Encoding**: Sama seperti Poin 3

## 5. Skenario Error (harus menghasilkan error jelas)

### 5.1 Poin 4 — Vendor dengan pelanggaran aktif (Vendor C di Q1 2025)
```bash
curl -X POST http://localhost:3000/vendor-sp/no-violation-certificate/export \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":3,"quarter":1,"year":2025}' \
  -w "\nHTTP_CODE: %{http_code}\n"
```

Expected: **HTTP 400** dengan body:
```json
{
  "statusCode": 400,
  "message": "Vendor memiliki N pelanggaran pada Q1 2025, tidak bisa cetak bukti tanpa pelanggaran. Selesaikan atau arsipkan pelanggaran tersebut terlebih dahulu."
}
```

### 5.2 Poin 4 — Quarter masih berjalan (current quarter)
```bash
# Asumsi current quarter adalah Q3 2026 (saat ini)
curl -X POST http://localhost:3000/vendor-sp/no-violation-certificate/export \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":2,"quarter":3,"year":2026}' \
  -w "\nHTTP_CODE: %{http_code}\n"
```

Expected: **HTTP 400** dengan body:
```json
{
  "statusCode": 400,
  "message": "Q3 2026 adalah kuartal yang sedang berjalan (saat ini Q<N> <YEAR>). Surat bebas pelanggaran hanya bisa dicetak untuk kuartal lampau."
}
```

### 5.3 Poin 3 — Vendor tidak ditemukan
```bash
curl -X POST http://localhost:3000/vendor-sp/penalty-receipt/export \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":99999,"quarter":1,"year":2025}' \
  -w "\nHTTP_CODE: %{http_code}\n"
```

Expected: **HTTP 404** dengan body:
```json
{
  "statusCode": 404,
  "message": "Vendor dengan ID 99999 tidak ditemukan atau sudah dihapus."
}
```

### 5.4 Poin 3 — DTO invalid (quarter > 4)
```bash
curl -X POST http://localhost:3000/vendor-sp/penalty-receipt/export \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":1,"quarter":5,"year":2025}' \
  -w "\nHTTP_CODE: %{http_code}\n"
```

Expected: **HTTP 400** dari class-validator (`quarter must not be greater than 4`).

## 6. Verifikasi Role-Check (JWT + Handler)

### 6.1 Tanpa token
```bash
curl -X POST http://localhost:3000/vendor-sp/penalty-receipt/export \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":1,"quarter":1,"year":2025}' \
  -w "\nHTTP_CODE: %{http_code}\n"
```

Expected: **HTTP 401** (dari JwtAuthGuard).

### 6.2 Token valid tapi role Vendor
```bash
# Login sebagai role Vendor (bukan Admin HO/Super User), ambil token-nya
curl -X POST http://localhost:3000/vendor-sp/penalty-receipt/export \
  -H "Authorization: Bearer <TOKEN_VENDOR>" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":1,"quarter":1,"year":2025}' \
  -w "\nHTTP_CODE: %{http_code}\n"
```

Expected: **HTTP 403** dengan body:
```json
{
  "statusCode": 403,
  "message": "Akses hanya untuk role Admin HO / Super User. Role Anda: Vendor."
}
```

### 6.3 Token valid, role Super User → harus bisa
```bash
curl -X POST http://localhost:3000/vendor-sp/penalty-receipt/export \
  -H "Authorization: Bearer <TOKEN_SUPER_USER>" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":1,"quarter":1,"year":2025}' \
  --output bukti-sp-superuser.pdf
```

Expected: **HTTP 200**, PDF ter-download.

## 7. Verifikasi FE (Frontend)

Buka browser → navigasi ke halaman Detail SP vendor:
1. Klik salah satu baris di tabel `vendor-sp/view` → masuk ke halaman detail
2. Cek 2 tombol muncul di header kanan:
   - **"Cetak Bukti SP (PDF)"** (warna merah/primary-danger) — aktif
   - **"Cetak Surat Bebas Pelanggaran (PDF)"** — disabled dengan tooltip "Tidak bisa cetak surat bebas — vendor punya pelanggaran aktif di quarter ini" karena SP ini memang punya violations
3. Klik **Cetak Bukti SP (PDF)** → file PDF ter-download dengan nama `Bukti_SP_<VendorName>_<Q>_<Year>.pdf`
4. Cek sweetalert success: "Bukti SP PDF berhasil di-generate dan di-download"
5. (Opsional) Untuk test tombol "Surat Bebas", navigasi ke halaman SP yang dibuat di Q lampau tanpa violation (Vendor B), tombol akan aktif. Klik → jika vendor B punya violation aktif di Q tsb, dapat warning 400; jika clean, PDF surat bebas ter-download

## 8. Cek Audit Log di Database

```sql
SELECT id, module_type, module_id, issuer_id, properties, created_at
FROM logs
WHERE module_type IN ('EXPORT_PDF_PENALTY', 'EXPORT_PDF_NO_VIOLATION')
ORDER BY created_at DESC
LIMIT 10;
```

Expected: Setiap generate Poin 3/Poin 4 menghasilkan 1 row audit log dengan `properties` berisi JSON (vendor_id, quarter, year, total_orders, file_path, dll).

## 9. Cek File di Disk

```bash
ls -la storage/pdf/vendor-sp/
```

Expected: File dengan pola nama `penalty-<vendorId>-<Q>-<year>-<ts>-<rand>.pdf` dan/atau `no-violation-<vendorId>-<Q>-<year>-<ts>-<rand>.pdf`.

## 10. Checklist Ringkasan Verifikasi

| Item Poin 3 | Expected | Actual |
|---|---|---|
| Endpoint terdaftar | POST `/vendor-sp/penalty-receipt/export` | ☐ |
| Header + Footer + Tabel rapi | Ya | ☐ |
| Encoding karakter Indonesia | Bersih | ☐ |
| File tersimpan di disk | `storage/pdf/vendor-sp/` | ☐ |
| Audit log tercatat | `logs.module_type='EXPORT_PDF_PENALTY'` | ☐ |
| Vendor 404 | HTTP 404 | ☐ |
| Role bukan Admin HO/Super User | HTTP 403 | ☐ |
| Tanpa token | HTTP 401 | ☐ |

| Item Poin 4 | Expected | Actual |
|---|---|---|
| Endpoint terdaftar | POST `/vendor-sp/no-violation-certificate/export` | ☐ |
| Header + Footer + Kalimat resmi | Ya | ☐ |
| Nomor surat auto-increment | `BEBAS-2025-NNNN` | ☐ |
| Encoding karakter Indonesia | Bersih | ☐ |
| File tersimpan di disk | `storage/pdf/vendor-sp/` | ☐ |
| Audit log tercatat | `logs.module_type='EXPORT_PDF_NO_VIOLATION'` | ☐ |
| Vendor dengan pelanggaran aktif | HTTP 400 | ☐ |
| Quarter masih berjalan | HTTP 400 | ☐ |
| Vendor 404 | HTTP 404 | ☐ |
| Role bukan Admin HO/Super User | HTTP 403 | ☐ |
| Tanpa token | HTTP 401 | ☐ |

---

## Catatan Build / Known Limitations

1. **Font**: Pakai Helvetica built-in pdfkit (mendukung Latin-1/WinAnsi). Karakter Indonesia tanpa diakritik aman. Kalau di masa depan butuh karakter dengan diakritik (mis. "Dépan"), tambahkan TTF font via `doc.registerFont()`.

2. **Logo placeholder**: Saat ini pakai teks "MITRA10" sebagai placeholder. Untuk logo image asli, tambahkan method override di `PdfService.addHeader()` yang pakai `sharp(buffer).toBuffer()` + `doc.image()`.

3. **Auto-increment nomor surat (Poin 4)**: Counter sederhana berdasarkan count audit logs di tahun yang sama. Jika ada concurrency tinggi (multiple users generate bersamaan), bisa terjadi duplicate sequence number. Untuk production high-concurrency, tambahkan UNIQUE constraint atau table sequence terpisah.

4. **Hard-coded folder**: `./storage/pdf/vendor-sp/` (relatif terhadap working dir). Pastikan direktori writable di production. `PdfService.pipeAndSave()` auto-create folder.

5. **Table helper**: Row tinggi tetap (single-line assumption). Kalau violation name sangat panjang (mis. > 80 char), mungkin overflow. Untuk data normal tidak masalah.

6. **JWT auth**: Tanpa token → 401 (dari JwtAuthGuard). Token valid + role salah → 403 (dari handler). Keduanya berlaku untuk Poin 3 DAN Poin 4.