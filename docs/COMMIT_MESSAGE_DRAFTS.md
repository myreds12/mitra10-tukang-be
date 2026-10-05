# Commit Message Drafts (Option B — 4 separate commits)

Sesuai rekomendasi dari snapshot terakhir. User tinggal review, edit kalau perlu, lalu apply (atau minta saya apply dengan izin eksplisit). Saya TIDAK melakukan `git commit` tanpa izin eksplisit.

---

## Commit 1/4 — Poin 1 (fix bug Log Pelanggaran)

**Scope**: bug sync `vendor_sp_detail` saat issueSP, idempotency guard, notifikasi di luar transaction, revision sync helper, backfill script + spec test.

```
fix(vendor-violation): issueSP idempotency + syncVendorSpDetail helper + backfill script

Bug: helper sync vendor_sp_detail tidak dipanggil konsisten di kedua branch
issueSP (issued vs updated) sehingga detail points tidak konsisten dengan
status SP. Kegagalan notifikasi vendor di-catch terpisah agar tidak menggagalkan
SP yang sudah di-commit.

Changes:
- common/utils/vendor-sp-detail-sync.util.ts: helper syncVendorSpDetails(tx, opts)
- vendor-violation.service.ts: checkAndUpdateVendorSP dipanggil dalam $transaction
  dengan idempotency check "if SP with this level already exists (prevent duplicate)";
  signature method update ke (vendor_id, userId) untuk audit-trail
- violation-detector.service.ts: checkAndIssueSP dibungkus $transaction;
  notifikasi vendor dipindah ke LUAR transaction (catch terpisah); tambah
  diskriminator `kind: 'issued' | 'updated'`
- vendor-violation-revision.service.ts: syncVendorSpAfterPointChange panggil helper
  sync yang sama di kedua branch (approve + reject)
- prisma/scripts/backfill-vendor-sp-detail.ts: script backfill idempotent
  dengan --dry-run (default) + --execute, persistent log ke
  ./storage/logs/backfill-vendor-sp-detail-<ISO-timestamp>.log
- Tests: vendor-violation.service.spec.ts, violation-detector.service.spec.ts,
  vendor-violation-revision.service.spec.ts (17/17 PASS)
```

**Files (8)**:
- `prisma/scripts/backfill-vendor-sp-detail.ts` (new)
- `src/common/utils/vendor-sp-detail-sync.util.ts` (new)
- `src/common/services/violation-detector.service.ts` (modified)
- `src/common/services/violation-detector.service.spec.ts` (new)
- `src/vendor-violation/vendor-violation.service.ts` (modified)
- `src/vendor-violation/vendor-violation.service.spec.ts` (new)
- `src/vendor-violation/vendor-violation-revision.service.ts` (modified)
- `src/vendor-violation/vendor-violation-revision.service.spec.ts` (new)

---

## Commit 2/4 — Poin 2 + Tugas 2 (Excel export + JWT-only protection)

**Scope**: Endpoint Excel export Log Pelanggaran dengan proteksi JWT-only + role-check (Admin HO / Super User). 50k hard cap, audit log, FE download button.

```
feat(vendor-violation): Excel export Log Pelanggaran + JWT-only protection

Endpoint baru untuk export violation log ke Excel dengan 2 sheet
(Log Pelanggaran + Summary per Vendor), 50k row hard cap, audit log
ke tabel logs.

Proteksi: @UseGuards(JwtAuthGuard) + role-check handler (Admin HO / Super User
only, getRoleName dari DB). TIDAK pakai CASL granular — konsisten dengan
mayoritas controller lain di codebase dan keputusan final pasca discard
RBAC granular.

Changes:
- vendor-violation/dto/create-violation-log.dto.ts: ExportViolationLogDto dengan
  validasi (quarter 1-4, year 2000-2999, format excel, date range YYYY-MM-DD)
- vendor-violation.service.ts: exportViolationLogExcel dengan 2 sheet
  (Log Pelanggaran + Summary per Vendor), kolom "Ada Evidence", 50k hard cap,
  audit log ke logs (module_type='EXPORT') di catch terpisah
- vendor-violation.controller.ts: GET /vendor-violation/log/export dengan
  @UseGuards(JwtAuthGuard), role-check handler (Admin HO/Super User only),
  stream XLSX inline + Content-Disposition

Frontend (tukang):
- app/services/vendorViolationService.ts: exportLogs method
- app/modules/vendor-sp/components/ViewVendorViolationLog.tsx: tombol
  Download Excel + handler + loading state
```

**Files (5)**:
- `src/vendor-violation/dto/create-violation-log.dto.ts` (modified)
- `src/vendor-violation/vendor-violation.controller.ts` (modified)
- `src/vendor-violation/vendor-violation.service.ts` (modified)
- `tukang/src/app/modules/vendor-sp/components/ViewVendorViolationLog.tsx` (modified)
- `tukang/src/app/services/vendorViolationService.ts` (modified)

---

## Commit 3/4 — Poin 3 + Poin 4 (PDF Bukti SP + Surat Bebas Pelanggaran)

**Scope**: 2 endpoint PDF generation (penalty-receipt + no-violation-certificate) dengan fondasi bersama: PdfService reusable + ReportQueryHelper.

```
feat(vendor-sp): PDF Bukti SP + Surat Bebas Pelanggaran dengan PdfService reusable

Dua endpoint PDF baru di /vendor-sp:
- POST /penalty-receipt/export (Poin 3): generate PDF Bukti Surat Peringatan
  untuk vendor di quarter tertentu. Berisi info vendor, ringkasan
  order/pelanggaran/poin, rincian pelanggaran (tabel), tanda tangan 2 kolom.
- POST /no-violation-certificate/export (Poin 4): generate Surat Keterangan
  Bebas Pelanggaran. WAJIB (1) vendor TIDAK punya pelanggaran aktif di quarter,
  (2) quarter lampau (bukan berjalan). Auto-increment nomor surat
  BEBAS-<year>-<sequence>.

Proteksi: @UseGuards(JwtAuthGuard) + role-check handler (Admin HO / Super User,
getRoleName dari DB). TIDAK pakai CASL granular — konsisten Poin 2.

Fondasi bersama (PdfService + ReportQueryHelper):
- common/services/pdf.service.ts: PDF builder reusable dengan pdfkit
  (Helvetica built-in, support Latin-1/WinAnsi untuk karakter Indonesia tanpa
  diakritik). Helper: header (logo placeholder MITRA10), footer dengan page
  number + generated date, addSection, addTable (5 kolom dengan alignment +
  page break auto), addSignatureSection (2 kolom atau lebih dengan area
  garis ttd). Font: Helvetica built-in.
- vendor-sp/helpers/report-query.helper.ts: query helpers reusable —
  countVendorOrdersInQuarter, getViolationLogDetails, getSpByVendorAndQuarter,
  getCurrentQuarterInfo, isPastQuarter.

File handling:
- Simpan ke ./storage/pdf/vendor-sp/<penalty|no-violation>-<vendorId>-<Q>-<year>-<utc-timestamp>-<rand4>.pdf
- Collision-safe (timestamp + rand4 hex).
- User-facing filename: Bukti_SP_<VendorName>_<Q>_<Year>.pdf atau
  Surat_Bebas_Pelanggaran_<VendorName>_<Q>_<Year>.pdf (sanitize special chars).

Audit log ke tabel logs:
- Poin 3: module_type='EXPORT_PDF_PENALTY', properties JSON (vendor_id,
  quarter, year, total_orders, total_penalty_orders, total_points, sp_level,
  file_path, file_name, user_file_name)
- Poin 4: module_type='EXPORT_PDF_NO_VIOLATION', properties JSON (vendor_id,
  quarter, year, letter_number, total_orders, file_path, ...)
- Best-effort: audit failure tidak menggagalkan export (try/catch terpisah).

Frontend (tukang):
- app/services/vendorSpService.ts: generatePenaltyReceipt + generateNoViolationCertificate
  (fetch + blob + auto-download filename dari Content-Disposition)
- app/modules/vendor-sp/components/DetailVendorSP.tsx: 2 tombol di header card —
  "Cetak Bukti SP (PDF)" (primary-danger) + "Cetak Surat Bebas Pelanggaran (PDF)"
  (disabled kalau vendor punya pelanggaran aktif di quarter tsb, dengan
  tooltip penjelasan)

Manual verification: docs/MANUAL_VERIFICATION_POIN_3_4.md (10 sections:
build, seed, curl, visual checklist, error scenarios, role-check, FE,
audit log, disk, summary checklist + known limitations).

Library: pdfkit ^0.14.0 (pure Node, tanpa headless browser). sharp ^0.34.3
tersedia untuk embed image di masa depan (saat ini placeholder teks).
```

**Files (10)**:
- `src/common/services/pdf.service.ts` (new)
- `src/vendor-sp/helpers/report-query.helper.ts` (new in helpers/)
- `src/vendor-sp/dto/penalty-receipt.dto.ts` (new)
- `src/vendor-sp/dto/no-violation-certificate.dto.ts` (new)
- `src/vendor-sp/vendor-sp.service.ts` (modified)
- `src/vendor-sp/vendor-sp.controller.ts` (modified)
- `src/vendor-sp/vendor-sp.module.ts` (modified)
- `docs/MANUAL_VERIFICATION_POIN_3_4.md` (new)
- `tukang/src/app/services/vendorSpService.ts` (modified)
- `tukang/src/app/modules/vendor-sp/components/DetailVendorSP.tsx` (modified)

---

## Commit 4/4 (OPTIONAL — if user wants FE commit terpisah dari backend)

```
chore(fe): FE Poin 3 + Poin 4 button + service untuk PDF generation

Add 2 tombol di DetailVendorSP.tsx (Poin 3 + Poin 4) + 2 method baru di
vendorSpService.ts (generatePenaltyReceipt + generateNoViolationCertificate).

Disabled state: tombol "Cetak Surat Bebas" disable kalau vendor punya
pelanggaran aktif di quarter yang dipilih (lihat hasActiveViolationsInQuarter).

PDF download pakai fetch + blob + auto-detect filename dari
Content-Disposition header response.

Error handling: 400 (validation Poin 4) ditampilkan via Swal 'warning',
bukan 'error' — karena itu expected business rule, bukan error aplikasi.
```

**Files (2)**:
- `tukang/src/app/services/vendorSpService.ts` (modified — already in commit 3)
- `tukang/src/app/modules/vendor-sp/components/DetailVendorSP.tsx` (modified — already in commit 3)

Note: Commit 4 tidak perlu kalau user OK menggabungkan FE Poin 3+4 ke commit 3 (meskipun FE masuk scope beda repo). Rekomendasi: gabung FE ke commit Poin 3+4 (commit 3 di atas sudah include FE).

---

## Commit 5/4 — Poin 5 (Filter/Search Reaktivasi SP3)

**Scope**: filter/search di log reaktivasi + UI lengkap. **NOTE**: field `sp3_date_from/sp3_date_to` di-defer (butuh schema migration `previous_sp` relation di `vendor_reactivation_log` — dilaporkan di manual verification doc).

```
feat(vendor-sp): filter + search reaktivasi SP3 dengan pagination

GET /vendor-sp/reactivation sekarang support filter:
- search: case-insensitive contains di vendor.company_name ATAU pic_name
- status: 1=PENDING, 2=APPROVED, 3=REJECTED
- date_from/date_to: range reactivation request created_at (date_to inklusif
  sampai 23:59:59.999)
- page/take: pagination, max take=100

Proteksi: JWT-only + role-check handler (Admin HO/Super User via getRoleName).
Sama dengan keputusan Poin 2 (no CASL granular).

Backend (mitra10-tukang-api):
- vendor-sp/dto/query-reactivation-log.dto.ts (NEW): DTO dengan validasi
  class-validator (@IsIn([1,2,3]) untuk status, @Max(100) untuk take)
- vendor-sp.service.ts: tambah findReactivationLogs(query) — extend dari
  getReactivationLogs(vendorId?) yang lama. Return { data, meta: {total,page,take,skip} }
- vendor-v.controller.ts: GET /reactivation sekarang menerima QueryReactivationLogDto
  dengan role-check (Admin HO/Super User only)

Frontend (tukang):
- VendorReactivation.tsx: filter bar dengan 4 kontrol (Search debounce 300ms,
  Select status, RangePicker tanggal, tombol Reset). Empty state khusus
  dengan tombol reset filter di section inactive vendors dan tabel log.
- vendorSpService.ts: getReactivationLogs() extended dengan typed params

DEFERRED (per user instruction "laporkan dulu sebelum migration schema"):
sp3_date_from/sp3_date_to — butuh schema migration tambah relation
`previous_sp vendor_sp? @relation(...)` di vendor_reactivation_log. Filter
ini bisa ditambah setelah migration disetujui. Detail di
docs/MANUAL_VERIFICATION_POIN_5.md §8 Schema Gap Report.

Manual verification: docs/MANUAL_VERIFICATION_POIN_5.md (10 sections:
build, seed, 11 curl test cases, UI checklist 12 item, role-check,
edge cases, backward compat, schema gap report, checklist ringkasan).
```

**Files (5)**:
- `src/vendor-sp/dto/query-reactivation-log.dto.ts` (new)
- `src/vendor-sp/vendor-sp.service.ts` (modified — `findReactivationLogs` method)
- `src/vendor-sp/vendor-sp.controller.ts` (modified — endpoint + role-check)
- `tukang/src/app/modules/vendor-sp/components/VendorReactivation.tsx` (modified)
- `tukang/src/app/services/vendorSpService.ts` (modified)
- `docs/MANUAL_VERIFICATION_POIN_5.md` (new)

---

## Commit 6/6 — Poin 6 (Constraint Evidence Wajib)

**Scope**: schema column evidence_provenance + service-layer guard + 14 callsite SYSTEM_GENERATED + UI guard + badge legacy + 9 unit tests.

```
feat(vendor-violation): constraint evidence wajib + 14 callsite SYSTEM_GENERATED

Risk tinggi: mengubah signature recordViolation() yang dipanggil 14 callsite.
Mitigasi: Lapis 1 (schema) + Lapis 2 (service guard) + Lapis 3 (UI guard).
Hanya schema column baru yang nullable (NOT NULL schema di-defer ke iterasi
berikutnya agar data legacy tidak broken).

Schema (Lapis 1):
- vendor_violation_log: tambah `evidence_provenance String? @db.VarChar(50)
  @default("LEGACY")`. Pakai String bukan Prisma enum karena SQL Server tidak
  support. Type safety di TS via union 'MANUAL_UPLOAD'|'SYSTEM_GENERATED'|'LEGACY'.
- Data lama (sebelum fix ini): evidence_path=null → provenance otomatis LEGACY.

Service-layer guard (Lapis 2):
- common/enum/violation-type.enum.ts: tambah EvidenceProvenance type,
  ViolationEvidence discriminated union (MANUAL_UPLOAD butuh path,
  SYSTEM_GENERATED butuh snapshot). ViolationContext sekarang WAJIB ada
  field `evidence`.
- common/services/violation-detector.service.ts: recordViolation() validasi
  evidence via resolveEvidence() — throw BadRequestException kalau evidence
  undefined / provenance invalid / MANUAL_UPLOAD tanpa path / SYSTEM_GENERATED
  tanpa snapshot. Persist evidence_path + evidence_provenance ke DB.

UI guard (Lapis 3):
- vendor-violation/dto/create-violation-log.dto.ts: evidence_path dari
  @IsOptional() jadi @IsNotEmpty() (WAJIB). Provenance MANUAL_UPLOAD
  auto-set oleh service.
- FE ViewVendorViolationLog.tsx AddViolationForm: tambah Form.Item
  evidence_path dengan rules required.
- FE DetailVendorSP.tsx + ViewVendorViolationLog.tsx: badge "⚠ Tanpa Evidence"
  untuk legacy data (evidence_path=null) + tag "Sistem" / "Upload" untuk
  provenance data baru.

14 callsite update (semua pakai SYSTEM_GENERATED + JSON snapshot):
- refund.service.ts: REFUND_5_PER_QUARTER, REFUND_6_10_PER_QUARTER,
  QUOTATION_NOT_FULFILLED
- complaints.service.ts: CUSTOMER_COMPLAINT
- work_orders.service.ts: DOC_NOT_UPLOADED, STATUS_NOT_UPDATED_H1/H_PLUS
- quotation.service.ts: QUOTATION_LATE_H2, QUOTATION_LATE_H3
- reschedule.service.ts: RESCHEDULE_CHANGE_SCHEDULE
- order.service.ts: ORDER_NOT_CONFIRMED_H
- vendor-violation.scheduler.ts: ORDER_NOT_CONFIRMED, QUOTATION_LATE,
  STATUS_NOT_UPDATED, RESCHEDULE_NOT_UPDATED (4 callsite)

TIDAK ADA callsite yang exempt — semua triggered oleh system events yang
punya state context (order_id, timestamps, kondisi pemicu). Snapshot JSON
terserialisasi ke evidence_path untuk audit trail.

Unit tests (mandatory minimum terpenuhi):
- violation-detector.service.spec.ts (+4 tests Poin 6):
  * tanpa evidence → throw BadRequestException
  * MANUAL_UPLOAD tanpa path → throw
  * SYSTEM_GENERATED dengan snapshot → success + provenance tercatat
  * MANUAL_UPLOAD dengan path valid → success + path langsung disimpan
- create-violation-log.dto.spec.ts (NEW): 3 DTO validation tests
  (dengan evidence_path ok / tanpa evidence_path error / empty string error)
- refund.service.evidence.spec.ts (NEW): 2 callsite tests
  (REFUND_5 → snapshot refundCount, REFUND_6_10 → thresholdRange: '6-10')

Migration: pakai `npx prisma generate` setelah apply schema (sudah
dijalankan di sesi ini). Untuk apply ke DB: `npx prisma migrate dev`
atau `npx prisma db push` (tergantung workflow).
```

**Files (15)**:
- `prisma/schema.prisma` (modified — tambah column)
- `src/common/enum/violation-type.enum.ts` (modified — tambah types)
- `src/common/services/violation-detector.service.ts` (modified — signature + helper)
- `src/vendor-violation/dto/create-violation-log.dto.ts` (modified — required)
- `src/vendor-violation/dto/create-violation-log.dto.spec.ts` (new)
- `src/vendor-violation/vendor-violation.service.ts` (modified — set MANUAL_UPLOAD)
- `src/common/services/violation-detector.service.spec.ts` (modified — +4 tests)
- 7 callsite files: `refund.service.ts`, `complaints.service.ts`,
  `work_orders.service.ts`, `quotation.service.ts`, `reschedule.service.ts`,
  `order.service.ts`, `vendor-violation.scheduler.ts`
- `src/refund/refund.service.evidence.spec.ts` (new — callsite tests)
- FE: `ViewVendorViolationLog.tsx`, `DetailVendorSP.tsx`

---

## Apply steps (user-side, setelah review)

```bash
# Backend repo
cd C:\Tukang\mitra10-tukang-api

# Commit 1 — Poin 1
git add prisma/scripts/backfill-vendor-sp-detail.ts \
  src/common/utils/vendor-sp-detail-sync.util.ts \
  src/common/services/violation-detector.service.ts \
  src/common/services/violation-detector.service.spec.ts \
  src/vendor-violation/vendor-violation.service.ts \
  src/vendor-violation/vendor-violation.service.spec.ts \
  src/vendor-violation/vendor-violation-revision.service.ts \
  src/vendor-violation/vendor-violation-revision.service.spec.ts
git commit -F- <<'EOF'
fix(vendor-violation): issueSP idempotency + syncVendorSpDetail helper + backfill script
[full message from Commit 1 above]
EOF

# Commit 2 — Poin 2 + Tugas 2 (backend part)
git add src/vendor-violation/dto/create-violation-log.dto.ts \
  src/vendor-violation/vendor-violation.controller.ts \
  src/vendor-violation/vendor-violation.service.ts
git commit -F- <<'EOF'
feat(vendor-violation): Excel export Log Pelanggaran + JWT-only protection
[full message from Commit 2 above — backend part only]
EOF

# Commit 3 — Poin 3 + Poin 4 (backend + frontend)
cd C:\Tukang\mitra10-tukang-api
git add src/common/services/pdf.service.ts \
  src/vendor-sp/helpers/report-query.helper.ts \
  src/vendor-sp/dto/penalty-receipt.dto.ts \
  src/vendor-sp/dto/no-violation-certificate.dto.ts \
  src/vendor-sp/vendor-sp.service.ts \
  src/vendor-sp/vendor-sp.controller.ts \
  src/vendor-sp/vendor-sp.module.ts \
  docs/MANUAL_VERIFICATION_POIN_3_4.md
git commit -F- <<'EOF'
feat(vendor-sp): PDF Bukti SP + Surat Bebas Pelanggaran dengan PdfService reusable
[full message from Commit 3 above — backend part]
EOF

cd C:\Tukang\tukang
git add src/app/services/vendorSpService.ts \
  src/app/modules/vendor-sp/components/DetailVendorSP.tsx
git commit -F- <<'EOF'
feat(vendor-sp-fe): tombol PDF Bukti SP + Surat Bebas di DetailVendorSP
[short message — FE only, pairing dengan backend commit Poin 3+4]
EOF

cd C:\Tukang\mitra10-tukang-api

# Commit 5 — Poin 5 (filter reaktivasi)
git add src/vendor-sp/dto/query-reactivation-log.dto.ts \
  src/vendor-sp/vendor-sp.service.ts \
  src/vendor-sp/vendor-sp.controller.ts \
  docs/MANUAL_VERIFICATION_POIN_5.md
git commit -F- <<'EOF'
feat(vendor-sp): filter + search reaktivasi SP3 dengan pagination
[full message from Commit 5 above]
EOF

cd C:\Tukang\tukang
git add src/app/modules/vendor-sp/components/VendorReactivation.tsx \
  src/app/services/vendorSpService.ts
git commit -F- <<'EOF'
feat(vendor-sp-fe): filter UI reaktivasi SP3 + debounced search
[short message — FE only]
EOF

cd C:\Tukang\mitra10-tukang-api

# Commit 6 — Poin 6 (evidence wajib)
git add prisma/schema.prisma \
  src/common/enum/violation-type.enum.ts \
  src/common/services/violation-detector.service.ts \
  src/common/services/violation-detector.service.spec.ts \
  src/vendor-violation/dto/create-violation-log.dto.ts \
  src/vendor-violation/dto/create-violation-log.dto.spec.ts \
  src/vendor-violation/vendor-violation.service.ts \
  src/refund/refund.service.ts \
  src/complaints/complaints.service.ts \
  src/work_orders/work_orders.service.ts \
  src/quotation/quotation.service.ts \
  src/reschedule/reschedule.service.ts \
  src/order/order.service.ts \
  src/scheduler/vendor-violation.scheduler.ts \
  src/refund/refund.service.evidence.spec.ts
git commit -F- <<'EOF'
feat(vendor-violation): constraint evidence wajib + 14 callsite SYSTEM_GENERATED
[full message from Commit 6 above]
EOF

cd C:\Tukang\tukang
git add src/app/modules/vendor-sp/components/ViewVendorViolationLog.tsx \
  src/app/modules/vendor-sp/components/DetailVendorSP.tsx
git commit -F- <<'EOF'
feat(vendor-sp-fe): AddViolationForm evidence_path required + badge legacy
[short message — FE only]
EOF
```

User bebas adjust message + file staging sesuai kebutuhan. Saya TIDAK eksekusi `git commit` tanpa izin eksplisit.

## Catatan Poin 6 — migration ke DB

`prisma/schema.prisma` sudah terupdate, Prisma client sudah di-regenerate. Tapi **DB belum ter-migrate** — kolom `evidence_provenance` belum ada di SQL Server. Sebelum deploy:
1. Generate migration: `npx prisma migrate dev --name add_evidence_provenance`
2. Apply ke staging/production: jalankan SQL yang di-generate, atau `npx prisma migrate deploy`

Field baru nullable dengan default 'LEGACY' — backfill data lama otomatis aman (tidak ada constraint violation).