# Dokumen Teknis — AI Agent Pengambilan & Pengolahan Data

**Platform:** Mitra10 Tukang (TukangAPI)
**Prioritas:** #1 sesuai MoM 6 November 2026
**Status:** Desain / Menunggu Approval
**Versi Dokumen:** 0.1 (Draft)

---

## 1. Ringkasan

AI Agent adalah fondasi ekosistem Mitra10 Tukang berbasis data. Agent berperan untuk:

| Tujuan | Implementasi |
|---|---|
| Mengumpulkan data transaksi & aktivitas aplikasi | Agregasi query Prisma dari `orders`, `work_orders`, `complaints`, `invoices`, CSI |
| Mengidentifikasi pola pekerjaan & kebutuhan layanan | Analitik durasi per `service_type`, tren order, komplain |
| Menyediakan data dasar fitur berikutnya | Endpoint analytics yang dipakai fitur #2 (estimasi durasi), #3 (tools), #8 (Vendor SP) |
| Pengambilan keputusan berbasis data | Natural-language Q&A: admin bertanya, agent menjawab dengan data riil |

**Prinsip desain: READ-ONLY pada Phase 1.** Agent hanya membaca data. Agent tidak dapat memodifikasi order, vendor, atau data transaksi apa pun.

---

## 2. Arsitektur

### 2.1 Diagram Alur

```
┌──────────────┐     ┌──────────────────────────────────────────┐
│  Admin / HO  │────▶│  TukangAPI (NestJS)                      │
│  (Browser)   │     │                                          │
└──────────────┘     │  ┌────────────────────────────────────┐  │
      POST           │  │  AiAgentController (JWT + CASL)    │  │
   /ai-agent/chat    │  └──────────────┬─────────────────────┘  │
                     │                 │                        │
                     │                 ▼                        │
                     │  ┌────────────────────────────────────┐  │
                     │  │  AiAgentService (orchestrator)     │  │
                     │  │  - menyusun konteks               │  │
                     │  │  - Claude Tool Use loop            │  │
                     │  │  - audit log                       │  │
                     │  └──────┬─────────────────┬───────────┘  │
                     │         │                 │              │
                     │         ▼                 ▼              │
                     │  ┌─────────────┐   ┌──────────────────┐  │
                     │  │ Claude      │   │ DataAggregator   │  │
                     │  │ (Anthropic  │   │ Service          │  │
                     │  │ Messages    │   │ (Prisma,         │  │
                     │  │ API)        │   │  read-only)      │  │
                     │  └─────────────┘   └──────────────────┘  │
                     └──────────────────────────────────────────┘
```

### 2.2 Pola: Claude Tool Use (Function Calling)

Agent tidak "menebak" jawaban. Claude diberi daftar **tools** (fungsi agregasi data internal). Claude memutuskan tool mana yang dipanggil, sistem mengeksekusi query Prisma, hasil dikirim kembali ke Claude, Claude menyusun jawaban final.

Contoh percakapan internal:

```
User: "Berapa rata-rata durasi pemasangan gipsum 3 bulan terakhir?"

Claude → tool_call: get_work_order_summary({ from: "2026-08-11", to: "2026-11-11" })
System → tool_result: { avg_duration_hours: 6.4, by_service_type: [...] }
Claude → final: "Rata-rata durasi pemasangan gipsum 6,4 jam..."
```

Keunggulan pola ini:
- **Jawaban selalu berbasis data riil** — tidak ada halusinasi angka.
- **Audit-able** — setiap tool call tercatat di `ai_agent_tool_logs`.
- **Aman** — tool yang diekspos hanya fungsi baca, tidak ada akses tulis.

### 2.3 Integrasi Claude (Anthropic API)

| Item | Nilai |
|---|---|
| Endpoint | `POST https://api.anthropic.com/v1/messages` |
| Header | `x-api-key: <AI_ANTHROPIC_API_KEY>`, `anthropic-version: 2023-06-01` |
| Model (default) | `claude-sonnet-4-5` — configurable via env |
| Max tokens | Default 2.048, configurable |
| Timeout | Default 60 detik, configurable |
| Retry | 3x dengan exponential backoff (429 / 5xx) |

**Environment variables baru (.env):**

```ini
# Claude / Anthropic
AI_ANTHROPIC_API_KEY=""
AI_ANTHROPIC_BASE_URL="https://api.anthropic.com"   # bisa diganti proxy internal
AI_CLAUDE_MODEL="claude-sonnet-4-5"
AI_CLAUDE_MAX_TOKENS=2048
AI_CLAUDE_TIMEOUT_MS=60000

# Fitur & kontrol biaya
AI_AGENT_ENABLED=true
AI_AGENT_MAX_TURNS=8              # batas tool-loop per pertanyaan
AI_AGENT_DAILY_TOKEN_LIMIT=500000 # throttle per user per hari

# Status ID dinamis (status table DB-driven, tidak di-hardcode)
AI_AGENT_COMPLETED_STATUS_IDS="8,9"
AI_AGENT_CANCELLED_STATUS_IDS="10"
AI_AGENT_RESOLVED_COMPLAINT_STATUS_IDS=""
```

---

## 3. Struktur Modul (NestJS)

Mengikuti pola modul eksisting (`src/<module>/` dengan controller, service, dto):

```
src/ai-agent/
├── ai-agent.module.ts
├── ai-agent.controller.ts          # endpoint, JwtAuthGuard + permission CASL
├── ai-agent.service.ts             # orchestrator Claude Tool Use
├── dto/
│   ├── chat.dto.ts                 # { question, conversation_id? }
│   └── analytics-query.dto.ts      # { from?, to?, service_type_id? }
├── services/
│   ├── data-aggregator.service.ts  # semua query Prisma read-only
│   ├── claude-client.service.ts    # klien Anthropic Messages API
│   ├── work-pattern.service.ts     # analitik pola pekerjaan (fondasi fitur #2)
│   └── audit-log.service.ts        # pencatatan tool call & token usage
└── tools/
    └── tool-registry.ts            # definisi Claude tools (JSON schema)
```

Registrasi di `app.module.ts` setelah approval. Tidak ada perubahan pada modul lain — **zero breaking change**.

### 3.1 Claude Tools yang Diekspos

| Tool name | Sumber data | Fungsi |
|---|---|---|
| `get_transaction_summary` | `orders` | Total order, selesai, batal, GMV, AOV per periode |
| `get_work_order_summary` | `work_orders`, `m_order_details` | Durasi rata-rata, breakdown per service type |
| `get_work_patterns` | `work_orders`, `work_order_tukang` | Pola beban kerja tukang, jam sibuk |
| `get_complaint_summary` | `complaints`, `complaint_channels` | Volume & kategori komplain |
| `get_vendor_summary` | `vendor`, `tukang` | Vendor/tukang aktif, top vendor by order |
| `get_csi_summary` | `csi_answers`, `csi_settings` | Skor kepuasan customer |

Semua tool menerima parameter `{ from, to }` dan bersifat read-only.

---

## 4. Desain Database (Tambahan)

Tiga tabel baru — untuk audit, history percakapan, dan kontrol biaya. Tidak ada perubahan skema eksisting.

```prisma
// Riwayat percakapan (1 user → banyak conversation)
model ai_agent_conversation {
  id        Int      @id @default(autoincrement())
  user_id   Int
  title     String?  @db.VarChar(255)
  is_active Boolean  @default(true)

  created_at DateTime  @default(now()) @db.DateTime()
  updated_at DateTime? @db.DateTime()
  deleted_at DateTime? @db.DateTime()

  users     users              @relation(fields: [user_id], references: [id])
  messages  ai_agent_message[]
}

// Pesan dalam percakapan (user / assistant / tool_result)
model ai_agent_message {
  id              Int     @id @default(autoincrement())
  conversation_id Int
  role            String  @db.VarChar(20)   // USER | ASSISTANT | TOOL
  content         String  @db.Text

  input_tokens  Int @default(0)
  output_tokens Int @default(0)

  created_at DateTime  @default(now()) @db.DateTime()
  deleted_at DateTime? @db.DateTime()

  conversation ai_agent_conversation @relation(fields: [conversation_id], references: [id])
  tool_logs    ai_agent_tool_log[]
}

// Audit setiap tool call: query apa, parameter apa, hasil ringkas
model ai_agent_tool_log {
  id         Int     @id @default(autoincrement())
  message_id Int
  tool_name  String  @db.VarChar(100)
  arguments  Json                                        // parameter tool
  result_digest String? @db.Text                         // ringkasan hasil (bukan full data)
  duration_ms Int?

  created_at DateTime @default(now()) @db.DateTime()

  message ai_agent_message @relation(fields: [message_id], references: [id])

  @@index([tool_name])
  @@index([created_at])
}
```

**Catatan keamanan:** `result_digest` menyimpan ringkasan, bukan data mentah, agar PII customer (nama, telepon, alamat) tidak tersimpan berulang di tabel log.

---

## 5. API Design

Base path: `/ai-agent` — semua endpoint diproteksi `JwtAuthGuard` + permission CASL `menuName: "AI Agent"`.

### 5.1 Chat (Natural Language Q&A)

```
POST /ai-agent/chat
Body:  { "question": "Berapa rata-rata durasi pemasangan gipsum 3 bulan terakhir?", "conversation_id": 12 }
Resp 200:
{
  "conversation_id": 12,
  "answer": "Rata-rata durasi pemasangan gipsum 3 bulan terakhir adalah 6,4 jam ...",
  "tools_used": [
    { "name": "get_work_order_summary", "duration_ms": 340 }
  ],
  "usage": { "input_tokens": 1820, "output_tokens": 210 }
}
Resp 429: { "message": "Kuota token harian telah habis" }   // kontrol biaya
Resp 503: { "message": "AI Agent sedang tidak tersedia" }   // AI_AGENT_ENABLED=false
```

### 5.2 Analytics (dipakai FE dashboard & fitur lain)

| Method | Path | Fungsi |
|---|---|---|
| GET | `/ai-agent/summary/transaction?from&to` | Ringkasan transaksi |
| GET | `/ai-agent/summary/work-order?from&to` | Ringkasan work order & durasi |
| GET | `/ai-agent/summary/complaint?from&to` | Ringkasan komplain |
| GET | `/ai-agent/summary/vendor?from&to` | Ringkasan vendor & tukang |
| GET | `/ai-agent/work-patterns?from&to&service_type_id` | Pola pekerjaan (fondasi fitur #2) |
| GET | `/ai-agent/conversations` | Riwayat percakapan user |
| GET | `/ai-agent/conversations/:id` | Detail percakapan + tool logs |
| GET | `/ai-agent/health` | Status konfigurasi Claude (tanpa key di-fix) |

### 5.3 Contoh Response `work-patterns`

```json
{
  "period": { "from": "2026-08-11", "to": "2026-11-11" },
  "by_service_type": [
    {
      "service_type": "Pemasangan Gipsum",
      "total_jobs": 214,
      "avg_duration_hours": 6.4,
      "p50_hours": 5.8,
      "p90_hours": 9.1,
      "on_time_rate": 0.87
    }
  ],
  "peak_days": ["Saturday", "Sunday"],
  "tukang_utilization": [ /* ... */ ]
}
```

Output ini menjadi **input langsung fitur #2 (estimasi durasi)** — tidak perlu komputasi ulang.

---

## 6. Keamanan & Kontrol

| Aspek | Mekanisme |
|---|---|
| Autentikasi | JWT (pola eksisting semua modul) |
| Otorisasi | CASL `@CheckPermissions([PermissionAction.READ, 'AI Agent'])` |
| Isolasi data | Agent hanya memanggil tool agregasi — tidak ada raw SQL dari input user |
| PII | Jawaban Claude dibatasi data agregat; tool tidak mengekspos PII customer |
| Audit | Semua tool call tercatat (`ai_agent_tool_log`) |
| Biaya | Daily token limit per user + `AI_AGENT_ENABLED` kill-switch |
| API Key | Hanya di `.env`, tidak pernah dikirim ke FE |

---

## 7. Roadmap Implementasi

| Fase | Scope | Estimasi | Output |
|---|---|---|---|
| **P1 — Mockup & Docs** | Desain UI + dokumen ini (posisi saat ini) | ✅ | Approval desain |
| **P2 — Data Layer** | `DataAggregatorService`, `WorkPatternService`, tabel audit + migrasi | 1 minggu | Endpoint analytics siap |
| **P3 — Claude Integration** | `ClaudeClientService` (Anthropic Messages API + Tool Use), `AiAgentService` loop | 1 minggu | `POST /ai-agent/chat` berfungsi |
| **P4 — UI** | Integrasi FE sesuai mockup (`docs/ai-agent/mockup/index.html`) | 1 minggu | Dashboard AI Agent live |
| **P5 — Hardening** | Rate limit, monitoring token, uji beban, dokumen final | 0,5 minggu | Production ready |

**Total estimasi: ± 3,5 minggu** setelah approval desain.

### Ketergantungan

1. **API key Anthropic** — perlu disediakan tim (atau proxy LLM internal bila ada kebijakan on-prem).
2. **Penentuan status ID** — konfirmasi ID status order SELESAI/BATAL aktual dari data produksi (env `AI_AGENT_*_STATUS_IDS`).
3. **Kualitas data historis** — `work_start_date`/`work_end_date` harus terisi konsisten agar analitik durasi valid.

---

## 8. Koneksi ke Fitur Lain (MoM)

| Fitur MoM | Ketergantungan pada AI Agent |
|---|---|
| #2 Estimasi durasi | Langsung memakai `work-patterns` (p50/p90 per service type) |
| #3 Tools & additional charge | Baseline pola jenis pekerjaan per service type |
| #8 Reward & Vendor SP | Data CSI, komplain, ketepatan waktu dari agregator |

---

## 9. Open Questions (Perlu Keputusan Bisnis)

1. Siapa saja role yang boleh mengakses AI Agent (HO only, atau vendor juga untuk datanya sendiri)?
2. Apakah jawaban agent perlu disertai sumber data (nomor order yang dipakai agregasi)?
3. Retensi data percakapan — berapa lama disimpan sebelum diarsip/dihapus?
4. Budget bulanan token Claude (untuk kalibrasi daily limit)?
5. Apakah perlu on-premise LLM fallback karena kebijakan data perusahaan?

---

## Lampiran A — Contoh Request Anthropic

```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 2048,
  "system": "Anda adalah AI Agent analitik internal Mitra10 Tukang. Jawab HANYA berdasarkan hasil tool. Jika data tidak tersedia, katakan demikian. Bahasa: Indonesia.",
  "tools": [
    {
      "name": "get_work_order_summary",
      "description": "Ringkasan work order: durasi rata-rata & breakdown per jenis layanan dalam periode tertentu.",
      "input_schema": {
        "type": "object",
        "properties": {
          "from": { "type": "string", "format": "date" },
          "to":   { "type": "string", "format": "date" }
        },
        "required": ["from", "to"]
      }
    }
  ],
  "messages": [
    { "role": "user", "content": "Berapa rata-rata durasi pemasangan gipsum 3 bulan terakhir?" }
  ]
}
```

## Lampiran B — File Mockup

`docs/ai-agent/mockup/index.html` — buka langsung di browser (tanpa server, tanpa dependensi). Berisi 5 layar: Dashboard, Tanya AI, Pola Pekerjaan, Estimasi Durasi (preview fitur #2), dan Log & Audit.
