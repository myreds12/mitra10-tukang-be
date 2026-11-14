# Dokumen Teknis — Pengembangan Ekosistem Mitra10 Tukang

**Platform:** Mitra10 Tukang (TukangAPI)
**Acuan:** Minutes of Meeting 6 November 2026 — Pembahasan Pengembangan Fitur dan Ekosistem Mitra10 Tukang
**Peserta MoM:** Dony Setyawan dan tim terkait
**Status:** Desain / Menunggu Approval
**Versi Dokumen:** 1.0 (Draft)
**Tanggal:** 11 November 2026

---

## 1. Ringkasan Eksekutif

Dokumen ini merupakan dokumen teknis lengkap untuk pengembangan 8 modul ekosistem Mitra10 Tukang sesuai prioritas MoM, mencakup: arsitektur, desain database, desain API, keamanan, **estimasi pengerjaan per modul**, dependensi, dan risiko.

**Arah pengembangan:** layanan jasa berbasis data, standar operasional terukur, dan fleksibilitas bagi customer dan mitra tukang.

### 1.1 Kondisi Teknis Eksisting (Basis Pengembangan)

| Komponen | Kondisi Saat Ini |
|---|---|
| Backend | NestJS 9 (TypeScript), Prisma ORM (MySQL), ±113 modul aktif |
| Infra pendukung | Redis/Bull Queue, Event Emitter, Scheduler (@nestjs/schedule), JWT + CASL, Swagger |
| Integrasi eksisting | WhatsApp API (Yellow.ai), Email (Nodemailer), Google Sheets, PDF/Excel generator |
| Domain inti | order → quotation → work_orders → tukang → invoice; complaints, remedials, reschedule, refund |
| Sudah berjalan | Vendor SP System (violation log, SP1–SP3, reaktivasi, revisi poin), CSI survey, vendor-registration |
| Belum ada | Payment gateway / disbursement, master tools, sistem reward, LLM/AI |

### 1.2 Ringkasan Estimasi Total

| Prio | Modul | Estimasi Effort | Kategori |
|---|---|---|---|
| 1 | AI Agent Pengambilan & Pengolahan Data | 3,5 minggu | Baru — fondasi data |
| 2 | Estimasi Durasi Berbasis Data Historis | 2 minggu | Baru — di atas fondasi #1 |
| 3 | Sistem Tools & Additional Charge | 2,5 minggu | Baru — master data + order flow |
| 4 | Tukang Mandiri (Independent Technician) | 6 minggu | Baru — perubahan arsitektur order |
| 5 | Layanan Instalasi Instan | 2,5 minggu | Ekstensi order + scheduling |
| 6 | Real-Time Disbursement | 5 minggu | Baru — integrasi eksternal |
| 7 | Deposit & Penalti Vendor | 2 minggu | Ekstensi sistem existing |
| 8 | Reward & Vendor Service Performance | 2,5 minggu | Ekstensi sistem existing |
| | **Total sekuensial** | **± 26 minggu** | |
| | **Total paralel (2 squad)** | **± 14–16 minggu** | Lihat bab roadmap |

---

## 2. Modul 1 — AI Agent Pengambilan & Pengolahan Data

### 2.1 Tujuan (sesuai MoM)

- Mengumpulkan data transaksi dan aktivitas dari aplikasi.
- Mengidentifikasi pola pekerjaan dan kebutuhan layanan.
- Menyediakan data sebagai dasar pengembangan fitur berikutnya.
- Fondasi pengambilan keputusan berbasis data (data-driven).

### 2.2 Arsitektur

Agent menggunakan pola **Claude Tool Use (function calling)** — Claude diberi daftar tool agregasi data internal. Claude memutuskan tool mana yang dipanggil, sistem mengeksekusi query Prisma read-only, hasil dikirim kembali, Claude menyusun jawaban.

```
Admin/HO ──POST /ai-agent/chat──▶ AiAgentController (JWT+CASL)
                                        │
                              AiAgentService (orchestrator)
                              │ Claude Tool Use loop (max turns)
              ┌───────────────┴────────────────┐
       ClaudeClientService              DataAggregatorService
       (Anthropic Messages API)         (Prisma, read-only)
       model: claude-sonnet-4-5         tools: 6 fungsi agregasi
```

**Keunggulan:** jawaban selalu berbasis data riil (anti-halusinasi), audit-able, read-only.

### 2.3 Skema Database Tambahan (3 tabel baru)

```prisma
model ai_agent_conversation {
  id        Int      @id @default(autoincrement())
  user_id   Int
  title     String?  @db.VarChar(255)
  is_active Boolean  @default(true)
  created_at DateTime @default(now()) @db.DateTime()
  users     users              @relation(fields: [user_id], references: [id])
  messages  ai_agent_message[]
}

model ai_agent_message {
  id              Int    @id @default(autoincrement())
  conversation_id Int
  role            String @db.VarChar(20)  // USER | ASSISTANT | TOOL
  content         String @db.Text
  input_tokens    Int    @default(0)
  output_tokens   Int    @default(0)
  conversation ai_agent_conversation @relation(fields: [conversation_id], references: [id])
  tool_logs    ai_agent_tool_log[]
}

model ai_agent_tool_log {
  id            Int     @id @default(autoincrement())
  message_id    Int
  tool_name     String  @db.VarChar(100)
  arguments     Json
  result_digest String? @db.Text   // ringkasan, tanpa PII
  duration_ms   Int?
  message ai_agent_message @relation(fields: [message_id], references: [id])
  @@index([tool_name])
}
```

### 2.4 Tools yang Diekspos ke Claude

| Tool | Sumber Data | Fungsi |
|---|---|---|
| `get_transaction_summary` | `orders` | Total order, selesai, batal, GMV, AOV |
| `get_work_order_summary` | `work_orders`, `m_order_details` | Durasi rata-rata per service type |
| `get_work_patterns` | `work_orders`, `work_order_tukang` | Beban kerja, jam sibuk |
| `get_complaint_summary` | `complaints` | Volume & kategori komplain |
| `get_vendor_summary` | `vendor`, `tukang` | Vendor/tukang aktif, top vendor |
| `get_csi_summary` | `csi_answers` | Skor kepuasan customer |

### 2.5 Endpoint Utama

| Method | Path | Fungsi |
|---|---|---|
| POST | `/ai-agent/chat` | Tanya jawab natural language |
| GET | `/ai-agent/summary/transaction` | Ringkasan transaksi |
| GET | `/ai-agent/summary/work-order` | Ringkasan work order & durasi |
| GET | `/ai-agent/work-patterns` | Pola pekerjaan (input modul 2) |
| GET | `/ai-agent/conversations` | Riwayat percakapan |
| GET | `/ai-agent/health` | Status konfigurasi |

### 2.6 Konfigurasi Environment

```ini
AI_ANTHROPIC_API_KEY=""
AI_ANTHROPIC_BASE_URL="https://api.anthropic.com"
AI_CLAUDE_MODEL="claude-sonnet-4-5"
AI_AGENT_ENABLED=true
AI_AGENT_MAX_TURNS=8
AI_AGENT_DAILY_TOKEN_LIMIT=500000
```

### 2.7 Keamanan

JWT + CASL permission `AI Agent`; agent hanya memanggil tool agregasi (tanpa raw SQL dari input user); PII customer tidak diekspos; audit semua tool call; daily token limit sebagai kontrol biaya; API key hanya di backend.

### 2.8 Estimasi Pengerjaan

| Fase | Scope | Durasi |
|---|---|---|
| P2 — Data Layer | DataAggregator, WorkPattern, migrasi tabel audit | 1 minggu |
| P3 — Claude Integration | ClaudeClient (Anthropic API + Tool Use), orchestrator | 1 minggu |
| P4 — UI | Integrasi FE sesuai mockup | 1 minggu |
| P5 — Hardening | Rate limit, monitoring token, uji beban | 0,5 minggu |
| **Total** | | **3,5 minggu** |

### 2.9 Dependensi

1. API key Anthropic (atau proxy LLM internal).
2. Konfirmasi ID status order SELESAI/BATAL aktual dari data produksi.
3. Konsistensi pengisian `work_start_date`/`work_end_date`.

> Rincian teknis modul ini tersedia dalam dokumen pendalaman: `docs/ai-agent/TEKNIS_AI_AGENT.md`.

---

## 3. Modul 2 — Estimasi Durasi Pengerjaan Berbasis Data

### 3.1 Tujuan (sesuai MoM)

- Mengukur rata-rata durasi berdasarkan jenis pekerjaan.
- Membuat standar estimasi waktu pengerjaan.
- Customer mendapatkan informasi estimasi penyelesaian.
- Dasar perencanaan kapasitas dan penjadwalan tukang.

### 3.2 Arsitektur

Memanfaatkan **work-patterns dari Modul 1** (tanpa komputasi ulang). Batch job mingguan (Scheduler) menghitung statistik durasi per `service_type` dan menyimpan hasilnya sebagai "standar estimasi" yang dapat di-review HO sebelum dipakai.

```
Scheduler (mingguan) ──▶ WorkPatternService ──▶ tabel work_duration_standards
                                                      │ (draft → approved)
Order dibuat ──▶ EstimationService ──▶ baca standar approved ──▶ estimasi order
```

### 3.3 Skema Database Tambahan

```prisma
model work_duration_standards {
  id              Int     @id @default(autoincrement())
  service_type_id Int
  sample_count    Int                    // jumlah pekerjaan historis
  avg_hours       Decimal @db.Decimal(8, 2)
  p50_hours       Decimal @db.Decimal(8, 2)
  p90_hours       Decimal @db.Decimal(8, 2)
  on_time_rate    Decimal @db.Decimal(5, 4)
  status          Int     @default(1)    // 1 = DRAFT, 2 = APPROVED, 3 = MANUAL
  valid_from      DateTime @db.DateTime()
  valid_to        DateTime? @db.DateTime()
  calculated_at   DateTime @default(now()) @db.DateTime()
  service_type    service_type @relation(fields: [service_type_id], references: [id])
  @@index([service_type_id, status])
}

// Estimasi tersimpan per order (audit & pembelajaran ulang)
model order_duration_estimations {
  id            Int     @id @default(autoincrement())
  order_id      Int
  standard_id   Int?                       // null jika manual
  estimated_hours Decimal @db.Decimal(8, 2)
  actual_hours    Decimal? @db.Decimal(8, 2)
  variance_hours  Decimal? @db.Decimal(8, 2)
  orders order_duration_estimations @relation(fields: [order_id], references: [id])
}
```

### 3.4 Endpoint Utama

| Method | Path | Fungsi |
|---|---|---|
| GET | `/duration/standards` | Daftar standar durasi per service type |
| POST | `/duration/standards/:id/approve` | Approval HO (draft → approved) |
| POST | `/orders/:id/estimation` | Hitung & simpan estimasi untuk order |
| GET | `/duration/capacity?area_id` | Perencanaan kapasitas per area |
| GET | `/duration/accuracy-report` | Laporan akurasi estimasi vs aktual |

### 3.5 Aturan Bisnis

- Jenis pekerjaan dengan **sample < 50** memakai estimasi manual (confidence rendah) hingga data cukup.
- Standar dihitung ulang tiap minggu; yang sudah `APPROVED` hanya berubah bila HO approve versi baru.
- Estimasi customer ditampilkan dengan rentang (p50–p90) dan disclaimer jumlah sample.

### 3.6 Estimasi Pengerjaan

| Fase | Scope | Durasi |
|---|---|---|
| Batch kalkulasi statistik + migrasi | Scheduler, 2 tabel baru | 0,5 minggu |
| Service estimasi + integrasi order flow | Backend + endpoint | 0,5 minggu |
| UI (admin standards + tampilan customer) | FE | 0,5 minggu |
| QA + validasi data historis | | 0,5 minggu |
| **Total** | | **2 minggu** (setelah modul 1 selesai) |

---

## 4. Modul 3 — Sistem Informasi Tools & Biaya Tambahan

### 4.1 Tujuan (sesuai MoM)

- Identifikasi kebutuhan peralatan per jenis pekerjaan.
- Kategori peralatan khusus/berukuran besar (mis. tangga) → additional charge.
- Transparansi alat & biaya bagi customer sebelum pekerjaan.

### 4.2 Arsitektur

Master data tools + mapping ke `service_type`. Saat order dibuat, sistem generate checklist tools otomatis; additional charge ditambahkan ke `orders.additional_fee` (field **sudah ada**).

```
Master tools ──mapping──▶ service_type
Order dibuat ──▶ ToolRequirementService ──▶ checklist + additional_fee ──▶ quotation/order
Tukang ──▶ lihat checklist (work order) ──▶ konfirmasi bawa/digunakan
```

### 4.3 Skema Database Tambahan

```prisma
model tools {
  id          Int     @id @default(autoincrement())
  name        String  @db.VarChar(255)
  category    Int     @default(1)  // 1 = STANDAR, 2 = BESAR, 3 = KHUSUS
  description String? @db.Text
  charge_type Int?                 // 1 = PER_PEKERJAAN, 2 = PER_HARI, null = gratis
  charge_nominal Decimal @default(0) @db.Decimal(32, 2)
  is_active   Boolean @default(true)
  created_at  DateTime @default(now()) @db.DateTime()
}

model service_type_tools {
  id              Int  @id @default(autoincrement())
  service_type_id Int
  tool_id         Int
  is_required     Boolean @default(true)   // WAJIB / OPSI
  condition_note  String? @db.VarChar(500) // mis. "hanya plafon >= 4m"
  tools        tools        @relation(fields: [tool_id], references: [id])
  service_type service_type @relation(fields: [service_type_id], references: [id])
  @@unique([service_type_id, tool_id])
}

// Checklist ter-generate per work order
model work_order_tools {
  id             Int  @id @default(autoincrement())
  work_order_id  Int
  tool_id        Int
  is_brought     Boolean?          // dikonfirmasi tukang saat mulai
  charge_applied Decimal @default(0) @db.Decimal(32, 2)
  work_orders work_orders @relation(fields: [work_order_id], references: [id])
  tools        tools       @relation(fields: [tool_id], references: [id])
}
```

### 4.4 Endpoint Utama

| Method | Path | Fungsi |
|---|---|---|
| CRUD | `/tools` | Master tools (admin) |
| CRUD | `/service-types/:id/tools` | Mapping tools ↔ jenis pekerjaan |
| GET | `/work-orders/:id/tools` | Checklist tools untuk tukang |
| PATCH | `/work-orders/:id/tools/:toolId` | Konfirmasi tukang membawa tool |
| GET | `/orders/:id/additional-charges` | Rincian biaya tambahan untuk customer |

### 4.4 Estimasi Pengerjaan

| Fase | Scope | Durasi |
|---|---|---|
| Master data + mapping (3 tabel, CRUD) | Backend | 1 minggu |
| Generate checklist + integrasi additional_fee ke order/quotation flow | Backend | 0,5 minggu |
| UI (admin master + tampilan customer + konfirmasi tukang) | FE | 0,5 minggu |
| QA + seed data tools awal | | 0,5 minggu |
| **Total** | | **2,5 minggu** |

**Catatan:** tidak ada perubahan skema order — memakai `orders.additional_fee` yang sudah ada.

---

## 5. Modul 4 — Tukang Mandiri (Independent Technician)

### 5.1 Tujuan (sesuai MoM)

- Tukang bergabung individu tanpa vendor (konsep Gojek).
- Customer mencari & memesan tukang langsung.
- Sistem pencarian, pemesanan, penugasan, pemantauan.
- Mekanisme verifikasi, penilaian, pengawasan kualitas.

### 5.2 Arsitektur

Fondasi mendukung: `tukang.vendor_id` **sudah nullable**. Namun alur order saat ini vendor-centric (assignment via vendor, `vendor.max_order`), sehingga perlu lapisan assignment baru.

```
Customer ──cari──▶ TukangMandiriService (filter: area, service, rating, slot)
        ──pesan──▶ orders (channel = MANDIRI) ──▶ penugasan LANGSUNG ke tukang
                                                    (bukan via vendor)
Verifikasi: onboarding flow (adapta vendor-registration) + rating berkelanjutan
Pengawasan: bukti before/after wajib + geo-tag (opsional)
```

**Perubahan kunci:**

1. Field baru di `orders`: `assignment_type` (VENDOR | MANDIRI) + `tukang_id` langsung.
2. Aturan kapasitas per tukang mandiri (mirip `vendor.max_order`).
3. Skema komisi/fee tukang mandiri berbeda dari vendor.
4. Rating tukang individual (saat ini rating belum ada di level tukang).

### 5.3 Skema Database Tambahan

```prisma
// Extend tukang
model tukang {
  // ... field existing ...
  registration_status Int? @default(1)  // 1 = DRAFT, 2 = VERIFIKASI, 3 = AKTIF, 4 = SUSPENDED
  is_independent      Boolean @default(false)
  max_concurrent      Int @default(2)   // kapasitas paralel tukang mandiri
}

model tukang_ratings {
  id        Int  @id @default(autoincrement())
  tukang_id Int
  order_id  Int
  score     Int              // 1–5
  comment   String? @db.Text
  rated_by  Int              // member_id
  tukang tukang @relation(fields: [tukang_id], references: [id])
  @@unique([order_id])
}

model tukang_verification_logs {
  id        Int  @id @default(autoincrement())
  tukang_id Int
  step      String @db.VarChar(50)   // DOKUMEN | WAWANCARA | TES_PRAKTIK | APPROVE
  status    Int    @default(1)       // 1 = PENDING, 2 = LULUS, 3 = GAGAL
  note      String? @db.Text
  reviewer  Int?
  tukang tukang @relation(fields: [tukang_id], references: [id])
}
```

### 5.4 Endpoint Utama

| Method | Path | Fungsi |
|---|---|---|
| POST | `/tukang-mandiri/register` | Pendaftaran + upload dokumen |
| GET | `/tukang-mandiri?service_type_id&area_id&min_rating` | Pencarian & filter |
| GET | `/tukang-mandiri/:id/slots?date` | Slot jadwal tersedia |
| POST | `/orders` (ext) | Pemesanan langsung ke tukang (assignment_type = MANDIRI) |
| POST | `/orders/:id/verify-completion` | Verifikasi customer + rating |
| GET | `/tukang-mandiri/:id/ratings` | Riwayat penilaian |

### 5.5 Estimasi Pengerjaan

| Fase | Scope | Durasi |
|---|---|---|
| Onboarding & verifikasi (flow + dokumen + log) | Backend | 1 minggu |
| Engine pencarian & slot (kapasitas, area, rating) | Backend | 1 minggu |
| Perubahan order flow (assignment_type, penugasan langsung) | Backend — **risiko tertinggi** | 1,5 minggu |
| Rating & verifikasi penyelesaian | Backend | 0,5 minggu |
| UI (pencarian customer, profil tukang, monitoring) | FE | 1 minggu |
| QA + uji regresi alur order vendor (regression test menyeluruh) | | 1 minggu |
| **Total** | | **6 minggu** |

**Risiko:** perubahan alur order berdampak ke modul order, work_orders, invoices. Wajib regression test penuh + feature flag `INDEPENDENT_TECHNICIAN_ENABLED` agar bisa dimatikan tanpa deploy ulang.

---

## 6. Modul 5 — Layanan Instalasi Instan

### 6.1 Tujuan (sesuai MoM)

- Customer memilih jadwal instalasi sesuai waktu yang diinginkan.
- Opsi layanan prioritas / instant service.
- Penjadwalan menyesuaikan ketersediaan tukang & kapasitas.
- Skema harga khusus.

### 6.2 Arsitektur

Ekstensi scheduling: slot dihitung dari ketersediaan tukang per area (menggunakan `vendor.max_order` / `tukang.max_concurrent`) dikurangi beban terjadwal. Layanan instan = slot prioritas same-day dengan markup harga.

```
SlotEngine: kapasitas area − beban terjadwal = slot tersedia (per jam)
Order instan ──▶ reserve slot + flag priority ──▶ markup harga (price rule)
```

### 6.3 Skema Database Tambahan

```prisma
model service_priority_pricing {
  id              Int  @id @default(autoincrement())
  service_type_id Int
  priority_type   Int             // 1 = INSTAN_SAME_DAY, 2 = INSTAN_PLUS_2H
  markup_percent  Decimal @db.Decimal(5, 2)  // mis. 15.00
  is_active       Boolean @default(true)
  service_type service_type @relation(fields: [service_type_id], references: [id])
}

model installation_slots {
  id        Int  @id @default(autoincrement())
  area_id   Int
  slot_date DateTime @db.Date()
  slot_hour Int          // 9, 13, 16
  capacity  Int
  reserved  Int @default(0)
  area area @relation(fields: [area_id], references: [id])
  @@unique([area_id, slot_date, slot_hour])
}

// Extend orders
model orders {
  // ... existing ...
  priority_type Int?        // null = REGULER, 1 = INSTAN
  slot_id       Int?
}
```

### 6.4 Endpoint Utama

| Method | Path | Fungsi |
|---|---|---|
| GET | `/instan/availability?area_id&date` | Slot tersedia per jam |
| GET | `/instan/pricing` | Skema markup per service type |
| POST | `/orders` (ext) | Booking dengan priority_type = INSTAN |
| GET | `/admin/instan/capacity` | Monitoring kapasitas (admin) |

### 6.5 Estimasi Pengerjaan

| Fase | Scope | Durasi |
|---|---|---|
| SlotEngine (kalkulasi ketersediaan real-time) | Backend | 1 minggu |
| Priority pricing + integrasi order flow | Backend | 0,5 minggu |
| UI (pilihan jadwal customer, admin monitoring) | FE | 0,5 minggu |
| QA | | 0,5 minggu |
| **Total** | | **2,5 minggu** |

**Dependensi keputusan bisnis:** finalisasi skema harga instan (MoM: "perlu dipertimbangkan skema harga khusus").

---

## 7. Modul 6 — Real-Time Disbursement

### 7.1 Tujuan (sesuai MoM)

Pencairan dana ke vendor/tukang real-time setelah: pekerjaan selesai → customer verifikasi → sistem konfirmasi → dana cair.

### 7.2 Arsitektur

```
Tukang selesai (bukti after) ──▶ Customer verifikasi ──▶ Event: ORDER_VERIFIED
        ──▶ DisbursementService ──▶ Payment Gateway API (Xendit/Midtrans Payout)
                │ retry + idempotency key                       │
                ▼                                               ▼
        tabel disbursements ◀──────────── webhook status ────────┘
        rekonsiliasi harian (Scheduler) vs catatan internal
```

**Desain penting:**
- **Idempotency** — 1 order = 1 disbursement (unique constraint), aman dari double-pay.
- **Retry otomatis** — Bull Queue, max 3 attempt dengan backoff.
- **Webhook handler** — update status dari gateway.
- **Rekonsiliasi harian** — Scheduler membandingkan total sistem vs gateway.

**Dependensi eksternal:** pemilihan payment gateway (Xendit Disbursement / Midtrans Payout / bank API langsung) + verifikasi rekening penerima (bank_id, account_number sudah ada di `vendor`).

### 7.3 Skema Database Tambahan

```prisma
model disbursements {
  id                Int  @id @default(autoincrement())
  order_id          Int  @unique          // idempotency: 1 order 1 pencairan
  recipient_type    Int                    // 1 = VENDOR, 2 = TUKANG_MANDIRI
  vendor_id         Int?
  tukang_id         Int?
  amount            Decimal @db.Decimal(32, 2)
  bank_id           Int
  account_number    String @db.VarChar(50)
  account_name      String @db.VarChar(200)
  gateway           String @db.VarChar(50)     // XENDIT | MIDTRANS | BANK_API
  external_id       String? @db.VarChar(100)   // id di sisi gateway
  status            Int @default(1)            // 1 = PENDING, 2 = DIPROSES, 3 = BERHASIL, 4 = GAGAL, 5 = REFUND
  failure_reason    String? @db.Text
  attempts          Int @default(0)
  disbursed_at      DateTime? @db.DateTime()
  orders orders @relation(fields: [order_id], references: [id])
  @@index([status])
  @@index([disbursed_at])
}

model disbursement_reconciliation {
  id           Int  @id @default(autoincrement())
  recon_date   DateTime @db.Date()
  total_system Decimal @db.Decimal(32, 2)
  total_gateway Decimal @db.Decimal(32, 2)
  difference   Decimal @default(0) @db.Decimal(32, 2)
  status       Int @default(1)  // 1 = BALANCE, 2 = SELISIH, 3 = INVESTIGASI
  @@unique([recon_date])
}
```

### 7.4 Endpoint Utama

| Method | Path | Fungsi |
|---|---|---|
| POST | `/disbursements/webhook` | Terima status gateway (public, signature-verified) |
| GET | `/disbursements` | Daftar transaksi (admin/finance) |
| POST | `/disbursements/:id/retry` | Retry manual transaksi gagal |
| GET | `/disbursements/reconciliation` | Laporan rekonsiliasi |
| GET | `/vendor/disbursements` | Riwayat pencairan milik vendor (dashboard vendor) |

### 7.5 Estimasi Pengerjaan

| Fase | Scope | Durasi |
|---|---|---|
| Integrasi gateway (disburse API + verifikasi rekening) | Backend | 1,5 minggu |
| Event handler + queue retry + idempotency | Backend | 1 minggu |
| Webhook + rekonsiliasi harian | Backend | 1 minggu |
| UI (admin finance + dashboard vendor) | FE | 0,5 minggu |
| QA + sandbox testing + drill skenario gagal | | 1 minggu |
| **Total** | | **5 minggu** |

**Dependensi eksternal terbesar:** akun produksi payment gateway, akun bank penerima terverifikasi, kebijakan finance (hold period, batas nominal per hari).

---

## 8. Modul 7 — Deposit & Penalti Vendor

### 8.1 Tujuan (sesuai MoM)

- Setiap vendor wajib punya saldo deposit sebagai jaminan kerja sama.
- Saldo tampil di dashboard vendor.
- Deposit berkurang saat ada penalti (kasus/pelanggaran).
- Pemotongan sesuai nilai penalti yang ditetapkan.
- Vendor bisa memantau riwayat pemotongan & saldo.

### 8.2 Arsitektur

**Fondasi sudah ada:** sistem `vendor_violation_log` + approval + `vendor_violation_revision_request` sudah berjalan. Modul ini hanya menambah ledger deposit dan hook pemotongan otomatis saat pelanggaran disetujui.

```
Pelanggaran disetujui (existing flow)
   ──▶ hook ──▶ potong deposit (transaction) ──▶ catat ledger
   ──▶ jika saldo < minimum ──▶ notifikasi + flag vendor (warning/suspend order)
Top-up ──▶ ledger + update saldo
Revisi/reset pelanggaran (existing) ──▶ refund potongan ──▶ ledger
```

### 8.3 Skema Database Tambahan

```prisma
model vendor_deposits {
  id         Int  @id @default(autoincrement())
  vendor_id  Int  @unique
  balance    Decimal @default(0) @db.Decimal(32, 2)
  min_balance Decimal @db.Decimal(32, 2)
  updated_at DateTime @updatedAt @db.DateTime()
  vendor vendor @relation(fields: [vendor_id], references: [id])
}

// Ledger append-only — setiap mutasi tercatat (tidak pernah diupdate/hapus)
model vendor_deposit_ledger {
  id          Int  @id @default(autoincrement())
  vendor_id   Int
  type        Int             // 1 = TOP_UP, 2 = PENALTI, 3 = REFUND_PENALTI, 4 = ADJUSTMENT
  amount      Decimal @db.Decimal(32, 2)  // positif = kredit, negatif = debit
  balance_after Decimal @db.Decimal(32, 2)
  violation_log_id Int?                   // link ke pelanggaran existing
  note        String? @db.Text
  created_by  Int?
  created_at  DateTime @default(now()) @db.DateTime()
  vendor vendor @relation(fields: [vendor_id], references: [id])
  violation_log vendor_violation_log? @relation(fields: [violation_log_id], references: [id])
  @@index([vendor_id, created_at])
}

// Extend violation type dengan nominal penalti
model vendor_violation_type {
  // ... existing ...
  penalty_nominal Decimal @default(0) @db.Decimal(32, 2)
}
```

### 8.4 Endpoint Utama

| Method | Path | Fungsi |
|---|---|---|
| GET | `/vendor/deposit` | Saldo & ringkasan (dashboard vendor) |
| GET | `/vendor/deposit/ledger` | Riwayat mutasi (vendor) |
| POST | `/admin/vendor/:id/deposit/top-up` | Top-up deposit (admin/finance) |
| GET | `/admin/vendor-deposits` | Monitoring semua vendor (admin) |
| PATCH | `/admin/violation-types/:id` | Set nilai penalti per pelanggaran |

### 8.5 Estimasi Pengerjaan

| Fase | Scope | Durasi |
|---|---|---|
| Ledger + saldo (transaksi DB, 2 tabel) | Backend | 0,5 minggu |
| Hook pemotongan otomatis ke approval flow existing + refund revisi | Backend | 0,5 minggu |
| UI dashboard vendor + admin | FE | 0,5 minggu |
| QA + migrasi saldo awal vendor existing | | 0,5 minggu |
| **Total** | | **2 minggu** |

**Paling siap dieksekusi** — hook ke sistem yang sudah berjalan, tanpa perubahan arsitektur.

---

## 9. Modul 8 — Reward & Vendor Service Performance

### 9.1 Tujuan (sesuai MoM)

Reward bagi vendor/tukang berdasarkan evaluasi Vendor Service Performance: kualitas hasil, ketepatan waktu, kepuasan customer, jumlah komplain, kepatuhan SOP.

### 9.2 Arsitektur

Skor komposit dihitung **per periode (quarterly)** oleh batch job, dari data yang sudah terkumpul. Reward periodik diberikan berdasarkan skor + syarat (tidak ada SP aktif — data live dari sistem existing).

```
Scheduler (quarterly)
  ──▶ hitung skor dari: work_orders (kualitas & waktu), csi_answers,
      complaints, vendor_violation_log (SOP)
  ──▶ simpan vendor_sp_scores (draft)
  ──▶ HO review & approve
  ──▶ generate reward eligibility ──▶ distribusi reward
```

### 9.3 Skema Database Tambahan

```prisma
model vendor_sp_scores {
  id         Int  @id @default(autoincrement())
  vendor_id  Int
  period     Int      // quarter 1–4
  year       Int
  score_quality    Decimal @db.Decimal(5, 2)  // bobot 25%
  score_on_time    Decimal @db.Decimal(5, 2)  // bobot 25%
  score_csi        Decimal @db.Decimal(5, 2)  // bobot 25%
  score_complaint  Decimal @db.Decimal(5, 2)  // bobot 15%
  score_sop        Decimal @db.Decimal(5, 2)  // bobot 10%
  total            Decimal @db.Decimal(5, 2)
  status           Int @default(1)  // 1 = DRAFT, 2 = APPROVED
  vendor vendor @relation(fields: [vendor_id], references: [id])
  @@unique([vendor_id, period, year])
}

model vendor_rewards {
  id         Int  @id @default(autoincrement())
  vendor_id  Int
  score_id   Int
  tier       Int             // 1 = GOLD, 2 = SILVER, 3 = BRONZE
  reward_type Int            // 1 = CASH, 2 = BONUS_ALOKASI_ORDER, 3 = LAINNYA
  nominal    Decimal? @db.Decimal(32, 2)
  notes      String? @db.Text
  distributed_at DateTime? @db.DateTime()
  vendor vendor @relation(fields: [vendor_id], references: [id])
  score vendor_sp_scores @relation(fields: [score_id], references: [id])
}
```

### 9.4 Aturan Bisnis (Indikator & Bobot)

| Indikator | Bobot | Sumber Data |
|---|---|---|
| Kualitas hasil pekerjaan | 25% | remedials + bukti after |
| Ketepatan waktu | 25% | work_orders vs estimasi (modul 2) |
| Kepuasan customer (CSI) | 25% | csi_answers |
| Komplain / kasus | 15% | complaints |
| Kepatuhan SOP | 10% | vendor_violation_log (non-komplain) |

Vendor dengan SP aktif → otomatis tidak eligible reward (data `vendor_sp` existing).

### 9.5 Endpoint Utama

| Method | Path | Fungsi |
|---|---|---|
| GET | `/vendor-sp/scores?period&year` | Leaderboard skor (admin) |
| POST | `/admin/vendor-sp/scores/:id/approve` | Approval skor periode |
| POST | `/admin/vendor-sp/rewards/distribute` | Distribusi reward periode |
| GET | `/vendor/rewards` | Riwayat reward (dashboard vendor) |

### 9.6 Estimasi Pengerjaan

| Fase | Scope | Durasi |
|---|---|---|
| Formula skor + batch quarterly (2 tabel) | Backend | 1 minggu |
| Integrasi eligibility SP + reward distribution | Backend | 0,5 minggu |
| UI (leaderboard admin + dashboard vendor) | FE | 0,5 minggu |
| QA + kalibrasi formula dengan data historis | | 0,5 minggu |
| **Total** | | **2,5 minggu** |

---

## 10. Roadmap Gabungan & Urutan Eksekusi

### 10.1 Dependency Graph

```
Modul 1 (AI Agent) ─────┬──▶ Modul 2 (Estimasi Durasi)
                        └──▶ Modul 8 (Reward — data kualitas & waktu)
Modul 7 (Deposit)  ── independen, bisa mulai kapan saja (fondasi ada)
Modul 3 (Tools)    ── independen
Modul 5 (Instan)   ── lebih baik setelah Modul 2 (estimasi slot lebih akurat)
Modul 4 (Mandiri)  ── setelah Modul 3 (checklist tools) & 7 (deposit jaminan)
Modul 6 (Disburse) ── setelah Modul 4 (penerima termasuk tukang mandiri) — atau paralel
```

### 10.2 Timeline Paralel (2 Squad)

| Sprint (2 minggu) | Squad A | Squad B |
|---|---|---|
| Sprint 1 | Modul 1 — Data Layer + Claude | Modul 7 — Deposit & Penalti (2 mgg) |
| Sprint 2 | Modul 1 — UI + Hardening | Modul 3 — Tools & Charge (mulai) |
| Sprint 3 | Modul 2 — Estimasi Durasi | Modul 3 — selesai + Modul 8 mulai |
| Sprint 4 | Modul 5 — Instalasi Instan | Modul 8 — Reward selesai |
| Sprint 5 | Modul 4 — Tukang Mandiri (mulai) | Modul 6 — Disbursement (mulai) |
| Sprint 6 | Modul 4 — lanjut | Modul 6 — lanjut |
| Sprint 7 | Modul 4 — QA regresi menyeluruh | Modul 6 — QA + sandbox |
| | **Selesai ± 14–16 minggu** | |

Sekuensial murni (1 squad): ± 26 minggu.

### 10.3 Milestone Approval

| Milestone | Deliverable | Gate |
|---|---|---|
| M0 | Mockup + dokumen ini | Approval Dony & tim |
| M1 | Modul 1 live | Validasi jawaban AI vs laporan manual |
| M2 | Modul 7 + 3 live | UAT finance & operasional |
| M3 | Modul 2 + 8 live | Kalibrasi formula dengan data historis |
| M4 | Modul 5 live | Keputusan skema harga instan |
| M5 | Modul 4 live (feature flag ON bertahap per area) | UAT penuh + regresi order |
| M6 | Modul 6 live | Drill pencairan sandbox + kebijakan finance |

---

## 11. Risiko Teknis & Mitigasi

| Risiko | Modul | Dampak | Mitigasi |
|---|---|---|---|
| Biaya token Claude melebihi budget | 1 | Biaya operasional | Daily token limit + monitoring + kill-switch |
| Data historis tidak konsisten (start/end date kosong) | 1, 2 | Estimasi tidak valid | Validasi & cleanup data sebelum go-live |
| Perubahan alur order vendor-centric → mandiri | 4 | Regression di order/invoice | Feature flag + regression test menyeluruh + rollout per area |
| Payment gateway reject / downtime | 6 | Vendor tidak dibayar | Retry queue + fallback manual approve oleh finance |
| Kualitas tukang mandiri tidak terkontrol | 4 | Reputasi layanan | Verifikasi berlapis + rating minimum + deposit jaminan (modul 7) |
| Skor reward dianggap tidak adil | 8 | Resistensi vendor | Bobot transparan di dashboard vendor + periode kalibrasi |

---

## 12. Open Questions — Perlu Keputusan Bisnis

1. **AI Agent (1):** role siapa saja yang boleh akses? apakah vendor boleh bertanya tentang datanya sendiri?
2. **Estimasi (2):** apakah estimasi ditampilkan ke customer sebagai janji atau rentang indikatif?
3. **Tools (3):** daftar harga additional charge final (tangga Rp 75rb dll — placeholder mockup)?
4. **Mandiri (4):** skema komisi tukang mandiri vs vendor? deposit jaminan tukang mandiri berapa?
5. **Instan (5):** finalisasi markup harga (15% same-day?) dan batas slot per area?
6. **Disbursement (6):** pilihan payment gateway (Xendit/Midtrans/bank API)? hold period? batas nominal harian?
7. **Deposit (7):** nilai minimum deposit per vendor? apakah tukang mandiri terikat aturan sama?
8. **Reward (8):** nilai & bentuk reward per tier (cash vs bonus alokasi order)? periode evaluasi quarterly atau monthly?
9. **Umum:** budget bulanan LLM + payment gateway fee; siapa owner product per modul?

---

## Lampiran A — Ringkasan Skema Database per Modul

| Modul | Tabel Baru | Perubahan Tabel Existing |
|---|---|---|
| 1. AI Agent | `ai_agent_conversation`, `ai_agent_message`, `ai_agent_tool_log` | — |
| 2. Estimasi Durasi | `work_duration_standards`, `order_duration_estimations` | — |
| 3. Tools | `tools`, `service_type_tools`, `work_order_tools` | — (pakai `orders.additional_fee`) |
| 4. Tukang Mandiri | `tukang_ratings`, `tukang_verification_logs` | `tukang` (+4 field), `orders` (+assignment_type, tukang_id) |
| 5. Instan | `service_priority_pricing`, `installation_slots` | `orders` (+priority_type, slot_id) |
| 6. Disbursement | `disbursements`, `disbursement_reconciliation` | — |
| 7. Deposit | `vendor_deposits`, `vendor_deposit_ledger` | `vendor_violation_type` (+penalty_nominal) |
| 8. Reward | `vendor_sp_scores`, `vendor_rewards` | — |

Total: **18 tabel baru**, 3 tabel existing ditambah field. Tidak ada skema existing yang diubah destructively.

## Lampiran B — Estimasi Rekapitulatif

| Modul | Backend | Frontend | QA | Total | Prasyarat |
|---|---|---|---|---|---|
| 1. AI Agent | 2 mgg | 1 mgg | 0,5 mgg | **3,5 mgg** | API key Anthropic |
| 2. Estimasi Durasi | 1 mgg | 0,5 mgg | 0,5 mgg | **2 mgg** | Modul 1 |
| 3. Tools & Charge | 1,5 mgg | 0,5 mgg | 0,5 mgg | **2,5 mgg** | — |
| 4. Tukang Mandiri | 4 mgg | 1 mgg | 1 mgg | **6 mgg** | Modul 3, 7 |
| 5. Instan Instalasi | 1,5 mgg | 0,5 mgg | 0,5 mgg | **2,5 mgg** | Keputusan harga |
| 6. Disbursement | 3,5 mgg | 0,5 mgg | 1 mgg | **5 mgg** | Gateway account |
| 7. Deposit & Penalti | 1 mgg | 0,5 mgg | 0,5 mgg | **2 mgg** | — |
| 8. Reward & SP | 1,5 mgg | 0,5 mgg | 0,5 mgg | **2,5 mgg** | Modul 1 (nilai kualitas) |

## Lampiran C — File Pendukung

- Mockup 8 modul (interaktif, buka di browser): `docs/mockup/index.html`
- Dokumen pendalaman AI Agent: `docs/ai-agent/TEKNIS_AI_AGENT.md`
- Skema eksisting acuan: `prisma/schema.prisma`

---

*Seluruh angka estimasi adalah estimasi engineering berbasis kompleksitas relatif terhadap codebase eksisting, belum termasuk buffer keputusan bisnis yang tertunda (lihat bab 12). Revisi estimasi dilakukan pada tiap milestone approval.*
