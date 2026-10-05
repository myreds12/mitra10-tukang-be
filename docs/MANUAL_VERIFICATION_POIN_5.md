# Manual Verification — Poin 5 (Filter/Search Reaktivasi SP3)

Scope: `mitra10-tukang-api` (backend) + `tukang` (frontend). Backend proteksi: JWT-only + role-check handler (Admin HO/Super User). Tidak pakai CSL/PermissionsGuard.

## 1. Build & Boot

```bash
# Terminal 1 — backend
cd C:\Tukang\mitra10-tukang-api
npm run start:dev

# Terminal 2 — frontend
cd C:\Tukang\tukang
npm start
```

Verifikasi backend boot tanpa error setelah dependency `QueryReactivationLogDto` di-resolve.

## 2. Seed Data Test (minimum)

Butuh variasi data reaktivasi untuk test filter. Minimal 5 log reaktivasi dengan variasi:
- **Vendor A** (PT Mitra Jaya), PIC Andi — status PENDING — created 2025-09-01
- **Vendor B** (CV Sentosa), PIC Budi — status APPROVED — created 2025-09-15
- **Vendor C** (UD Lestari), PIC Citra — status REJECTED — created 2025-10-01
- **Vendor D** (PT Makmur), PIC Dewi — status PENDING — created 2025-10-20
- **Vendor E** (CV Abadi), PIC Eko — status APPROVED — created 2025-11-05

Login dulu untuk dapat token:
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin_ho","password":"<password>"}'
```

Simpan `accessToken` dari response untuk dipakai di curl di bawah.

## 3. Curl Test Tiap Kombinasi Filter

### 3.1 Default (no filter)
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: 200, return `{ data: [...5 logs], meta: { total: 5, page: 1, take: 10, skip: 0 } }`, urutan desc by created_at.

### 3.2 Filter by search (nama vendor)
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?search=Mitra" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: hanya Vendor A (PT Mitra Jaya) yang match.

### 3.3 Filter by search (PIC name)
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?search=Budi" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: hanya Vendor B (PIC Budi) yang match. Search harus bekerja untuk company_name ATAU pic_name.

### 3.4 Filter by status (PENDING)
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?status=1" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: 2 log (Vendor A + Vendor D), keduanya PENDING.

### 3.5 Filter by status (APPROVED)
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?status=2" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: 2 log (Vendor B + Vendor E).

### 3.6 Filter by status (REJECTED)
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?status=3" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: 1 log (Vendor C).

### 3.7 Filter by date range (Sept 2025 only)
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?date_from=2025-09-01&date_to=2025-09-30" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: 2 log (Vendor A + Vendor B). date_to inklusif (sampai akhir hari 23:59:59).

### 3.8 Filter by date range (Oct 2025 only)
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?date_from=2025-10-01&date_to=2025-10-31" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: 2 log (Vendor C + Vendor D).

### 3.9 Filter gabung (status APPROVED + Oct/Nov only)
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?status=2&date_from=2025-10-01&date_to=2025-11-30" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: 1 log (Vendor E, approved Nov 5).

### 3.10 Pagination
```bash
# Page 1, take 2
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?page=1&take=2" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
# Expected: 2 log pertama (Vendor E + Vendor D, desc by date)

# Page 2, take 2
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?page=2&take=2" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
# Expected: 2 log berikutnya (Vendor C + Vendor B)

# Page 3, take 2
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?page=3&take=2" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
# Expected: 1 log terakhir (Vendor A)

# Beyond limit
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?take=101" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
# Expected: HTTP 400 (class-validator @Max(100) menolak)
```

### 3.11 Filter kombinasi semua
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?search=Sentosa&status=2&date_from=2025-09-01&date_to=2025-09-30&page=1&take=10" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: hanya Vendor B (CV Sentosa, PIC Budi, APPROVED, Sept 15). Single result.

## 4. UI Checklist (Frontend)

Buka browser → navigasi ke `/vendor-sp/reactivation`:

### Section Inactive Vendors
- [ ] Input.Search dengan placeholder "Cari nama vendor atau PIC..." tampil di atas grid
- [ ] Ketik di Input.Search → grid filter **realtime debounce 300ms**
- [ ] Allow clear (icon X) berfungsi
- [ ] Empty state tampil dengan pesan "Tidak ada vendor nonaktif sesuai pencarian \"...\"" + tombol "Reset Pencarian"
- [ ] Tombol "Aktifkan" di setiap card masih berfungsi seperti sebelumnya

### Section Log Reaktivasi
- [ ] Filter bar dengan 4 kontrol tampil: Search, Select status, RangePicker tanggal, tombol Reset
- [ ] Search debounce 300ms
- [ ] Select status menampilkan opsi: Pending (1), Disetujui (2), Ditolak (3) — dengan placeholder
- [ ] Allow clear di Select → filter status jadi "all"
- [ ] RangePicker dengan format YYYY-MM-DD, placeholder "Dari tanggal" / "Sampai tanggal"
- [ ] Mengubah Select atau RangePicker → pagination reset ke page 1
- [ ] Tombol Reset (icon ClearOutlined) → clear semua filter + reset ke page 1
- [ ] Tabel data ter-update sesuai filter aktif
- [ ] Pagination bawah tabel menampilkan total + halaman
- [ ] Empty state ketika tidak ada hasil: tampil "Tidak ada log reaktivasi sesuai filter" + tombol "Reset Filter"

## 5. Skenario Role-Check (JWT + Handler)

### 5.1 Tanpa token
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation"
```
Expected: **HTTP 401** (dari JwtAuthGuard).

### 5.2 Token valid, role Vendor
```bash
# Login sebagai vendor, ambil token-nya
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation" \
  -H "Authorization: Bearer <TOKEN_VENDOR>"
```
Expected: **HTTP 403** dengan body:
```json
{
  "statusCode": 403,
  "message": "Akses hanya untuk role Admin HO / Super User. Role Anda: Vendor."
}
```

### 5.3 Token valid, role Sales
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation" \
  -H "Authorization: Bearer <TOKEN_SALES>"
```
Expected: **HTTP 403**.

### 5.4 Token valid, role Super User
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation" \
  -H "Authorization: Bearer <TOKEN_SUPER>"
```
Expected: **HTTP 200** + data.

## 6. Edge Cases & Validation

### 6.1 DTO invalid (status=99)
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?status=99" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: **HTTP 400** (class-validator @IsIn([1,2,3]) menolak).

### 6.2 date_from invalid format
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?date_from=2025/09/01" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: filter diabaikan (date string bukan format valid, treated as no-op). Atau 400 kalau strict validation. Cek response untuk behavior pasti.

### 6.3 Empty search string
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?search=" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: sama dengan no filter — return semua 5 log.

### 6.4 Take > 100
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?take=500" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: **HTTP 400** (@Max(100) menolak).

## 7. Backward Compatibility Check

Curl lama (param `vendor_id`):
```bash
curl -X GET " 'http://localhost:3000/vendor-sp/reactivation?vendor_id=1" \
  -H "Authorization: Bearer <TOKEN_ADMIN_HO>"
```
Expected: filter by vendor_id masih bekerja (DTO support optional vendor_id). Response berisi log reaktivasi untuk vendor 1 saja.

## 8. Cek Audit Log (tidak ada)

Filter reaktivasi adalah READ endpoint — tidak menulis audit log. Poin 5 tidak menambah audit log entry.

---

## ⚠️ Schema Gap Report (BELUM DIPERBAIKI)

User minta filter `sp3_date_from?/sp3_date_to?` (filter by SP3 start_date join ke `previous_sp.start_date`). Implementasi ini **di-defer** karena:

- Tabel `vendor_reactivation_log` punya kolom `previous_sp_id` (Int?) di schema
- **TAPI tidak ada relation `previous_sp` di schema.prisma** (baris 2107-2114)
- Tanpa relation, untuk filter by `vendor_sp.start_date` perlu:
  1. Migration schema: tambah `previous_sp vendor_sp? @relation(...)` di `vendor_reactivation_log`
  2. Migration Prisma generate
  3. Update DTO + service dengan filter baru

Sesuai instruksi user: "kalau belum, LAPORKAN dulu sebelum bikin migration schema baru, karena itu perubahan lebih besar dari sekadar filter" → migration sengaja di-defer.

**Filter saat ini di Poin 5**:
- ✅ search (vendor company_name / PIC)
- ✅ status (Pending/Approved/Rejected)
- ✅ date_from / date_to (reactivation created_at)
- ✅ page / take (pagination max 100)
- ❌ sp3_date_from / sp3_date_to — **butuh schema migration**

**Cara enable sp3_date filter** (kalau user mau):
1. Update `prisma/schema.prisma` — tambah `previous_sp vendor_sp? @relation(fields: [previous_sp_id], references: [id])` di model `vendor_reactivation_log`, dan inverse relation di `vendor_sp`
2. Run `npx prisma generate` + migration
3. Update `QueryReactivationLogDto` — tambah `sp3_date_from?` dan `sp3_date_to?`
4. Update `findReactivationLogs` — tambah filter dengan join ke vendor_sp
5. Update FE — tambah RangePicker kedua atau extend RangePicker existing

---

## 9. Checklist Ringkasan

| Item Poin 5 | Expected | Actual |
|---|---|---|
| Endpoint terupdate | GET `/vendor-sp/reactivation?search=&status=&date_from=&date_to=&page=&take=` | ☐ |
| Filter search (vendor/PIC) | Bekerja | ☐ |
| Filter status | 1/2/3 divalidasi | ☐ |
| Filter date range | Inklusif | ☐ |
| Pagination max 100 | take > 100 → 400 | ☐ |
| Empty state UI | "Tidak ada log sesuai filter" + Reset | ☐ |
| Search debounce 300ms | Ya | ☐ |
| Role-check Admin HO/Super User | Bekerja | ☐ |
| Role lain | 403 | ☐ |
| Tanpa token | 401 | ☐ |
| Backward compat `vendor_id=` | Bekerja | ☐ |
| `sp3_date` filter | DEFER (schema migration needed) | ⚠️ dilaporkan |
| tsc --noEmit | EXIT 0 | ☐ |

## Known Limitations

1. **`sp3_date_from`/`sp3_date_to` di-defer** — butuh schema migration (lihat §8).
2. **Search menggunakan `contains` (case-sensitive di MySQL secara default, tergantung collation DB)** — kalau butuh case-insensitive yang strict, perlu `mode: 'insensitive'` (Postgres only) atau normalisasi manual.
3. **Pagination max 100** — hard cap di DTO. Untuk dataset besar yang butuh export, pakai mekanisme lain (CSV export, dsb).
4. **Tanpa unit test** — per instruksi Poin 5.