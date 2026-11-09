# Vendor Violation dan SP Flow

Dokumen ini memetakan seluruh jenis pelanggaran berdasarkan source code API.

## Mekanisme umum

~~~mermaid
flowchart TD
    A[Trigger event atau scheduler] --> B[recordViolation]
    B --> C[Cek jenis dan duplicate]
    C --> D[Simpan vendor_violation_log]
    D --> E[Hitung total poin quarter]
    E --> F{Poin >= 1?}
    F -- Tidak --> G[Tidak ada SP]
    F -- Ya --> H[Buat atau update vendor_sp]
    H --> I[Sync vendor_sp_detail]
    I --> J{SP3 baru?}
    J -- Ya --> K[Nonaktifkan vendor dan notif SP3]
    J -- Tidak --> L[Selesai]
~~~

Setiap recordViolation langsung menyimpan log, menghitung poin, lalu membuat atau memperbarui SP.

Sumber utama:

- src/common/services/violation-detector.service.ts
- src/scheduler/vendor-violation.scheduler.ts
- src/order/order.service.ts
- src/work_orders/work_orders.service.ts

## Jadwal scheduler

| Proses | Cron | Fungsi |
|---|---:|---|
| Daily violation check | 1 0 * * * | Order confirmation, quotation, status work order, reschedule |
| SP status check | 0 1 * * * | Expired SP dan reaktivasi SP3 |
| Quarterly reset | 0 0 1 1,4,7,10 * | Maintenance awal quarter |
| Weekly warning | 0 1 * * 1 | Peringatan mendekati threshold |

Timezone tidak diatur eksplisit pada ScheduleModule.forRoot(); waktu aktual mengikuti timezone process/server.

---

## 1. ORDER_NOT_CONFIRMED_H

Trigger: scheduler harian atau perubahan status order.

Basis waktu scheduler: work_orders.created_at, fallback orders.created_at.

~~~mermaid
flowchart TD
    A[Daily scheduler] --> B[Ambil order vendor aktif]
    B --> C{Status terminal?}
    C -- Ya --> Z[Skip]
    C -- Tidak --> D{Ada tukang aktif?}
    D -- Ya --> Z
    D -- Tidak --> E{Status in-progress?}
    E -- Ya --> Z
    E -- Tidak --> F[Hitung daysDiff]
    F --> G{daysDiff 0 atau 1?}
    G -- Ya --> H[Catat ORDER_NOT_CONFIRMED_H]
    G -- Tidak --> I[Rule H1 atau H_PLUS]
    H --> J[Hitung poin dan SP]
~~~

Pada event perubahan status order, sistem membaca newStatus.category, bukan order_history.

Status yang dianggap confirmed:

QUOTEIN, QUOTEOUT, WORKREQ, SURVEYREQ, TUKANGSURVEY, SURVEYDONE, WORKSTART, WORKEND.

---

## 2. ORDER_NOT_CONFIRMED_H1

Basis waktunya sama dengan H.

~~~mermaid
flowchart TD
    A[Daily scheduler] --> B[Filter order aktif]
    B --> C[Hitung daysDiff dari tanggal assignment]
    C --> D{daysDiff == 2?}
    D -- Tidak --> E[Rule lain atau skip]
    D -- Ya --> F[Catat ORDER_NOT_CONFIRMED_H1]
    F --> G[Hitung poin dan SP]
~~~

---

## 3. ORDER_NOT_CONFIRMED_H_PLUS

~~~mermaid
flowchart TD
    A[Daily scheduler] --> B[Order vendor belum confirmed]
    B --> C[Hitung daysDiff]
    C --> D{daysDiff >= 3?}
    D -- Tidak --> E[Rule H atau H1]
    D -- Ya --> F[Catat ORDER_NOT_CONFIRMED_H_PLUS]
    F --> G[Hitung poin dan SP]
~~~

Catatan: hari ke-0 dan hari ke-1 sama-sama masuk H pada kode saat ini.

---

## 4. RESCHEDULE_NOT_UPDATED

Kondisi: deleted_at NULL, confirm_date NULL, created_at <= kemarin, dan status belum approved/rejected.

~~~mermaid
flowchart TD
    A[Daily scheduler] --> B[Ambil reschedule aktif]
    B --> C{confirm_date NULL?}
    C -- Tidak --> Z[Skip]
    C -- Ya --> D{Status final?}
    D -- Ya --> Z
    D -- Tidak --> E[Hitung hari dari reschedule.created_at]
    E --> F{daysDiff >= 1?}
    F -- Tidak --> Z
    F -- Ya --> G[Catat RESCHEDULE_NOT_UPDATED]
    G --> H[Hitung poin dan SP]
~~~

---

## 5. RESCHEDULE_CHANGE_SCHEDULE

Trigger: update reschedule oleh vendor.

~~~mermaid
flowchart TD
    A[Update reschedule] --> B{User vendor?}
    B -- Tidak --> Z[Skip]
    B -- Ya --> C[Bandingkan tanggal lama dengan hari ini]
    C --> D{Hari pelaksanaan?}
    D -- Tidak --> Z
    D -- Ya --> E[Bandingkan tanggal lama dan baru]
    E --> F{Tanggal berubah?}
    F -- Tidak --> Z
    F -- Ya --> G[Catat RESCHEDULE_CHANGE_SCHEDULE]
    G --> H[Hitung poin dan SP]
~~~

Perbandingan memakai tanggal lokal server.

---

## 6. REFUND_5_PER_QUARTER

Trigger: refund dibuat/diproses.

~~~mermaid
flowchart TD
    A[Refund event] --> B[Ambil quarter dan year saat ini]
    B --> C[Count refund vendor pada quarter]
    C --> D{Jumlah == 5?}
    D -- Tidak --> E[Skip atau cek rule 6-10]
    D -- Ya --> F[Catat REFUND_5_PER_QUARTER]
    F --> G[Hitung poin dan SP]
~~~

Count saat ini menggunakan orders.created_at dalam rentang quarter.

---

## 7. REFUND_6_10_PER_QUARTER

~~~mermaid
flowchart TD
    A[Refund event] --> B[Count refund quarter berjalan]
    B --> C{Jumlah 6 sampai 10?}
    C -- Tidak --> Z[Skip]
    C -- Ya --> D[Catat REFUND_6_10_PER_QUARTER]
    D --> E[Hitung poin dan SP]
~~~

---

## 8. CUSTOMER_COMPLAINT

Trigger: complaint customer dibuat.

~~~mermaid
flowchart TD
    A[Complaint dibuat] --> B[Ambil order dan vendor]
    B --> C{Vendor tersedia?}
    C -- Tidak --> Z[Skip]
    C -- Ya --> D[Identifikasi tipe complaint]
    D --> E[Catat CUSTOMER_COMPLAINT]
    E --> F[Hitung poin dan SP]
~~~

Poin dibuat langsung saat complaint tercatat; tidak terlihat approval investigasi sebelum pencatatan.

---

## 9. QUOTATION_NOT_FULFILLED

Trigger: refund terjadi.

~~~mermaid
flowchart TD
    A[Refund event] --> B[Ambil quotation order]
    B --> C{Ada quotation fulfilled?}
    C -- Tidak --> Z[Skip]
    C -- Ya --> D[Status QUOTEOUT atau QUOTATIONPAID]
    D --> E[Catat QUOTATION_NOT_FULFILLED]
    E --> F[Hitung poin dan SP]
~~~

---

## 10. QUOTATION_LATE_H2

Basis waktu: history terakhir SURVEYDONE.

~~~mermaid
flowchart TD
    A[Scheduler atau quotation event] --> B[Cari history SURVEYDONE]
    B --> C{History ditemukan?}
    C -- Tidak --> Z[Skip]
    C -- Ya --> D[Hitung daysSinceSurvey]
    D --> E{daysDiff == 2?}
    E -- Tidak --> F[Rule H3 atau skip]
    E -- Ya --> G[Catat QUOTATION_LATE_H2]
    G --> H[Hitung poin dan SP]
~~~

Scheduler memakai Math.round(), sedangkan event quotation memakai Math.floor().

---

## 11. QUOTATION_LATE_H3

~~~mermaid
flowchart TD
    A[Scheduler atau quotation event] --> B[Cari history SURVEYDONE terakhir]
    B --> C{History ditemukan?}
    C -- Tidak --> Z[Skip]
    C -- Ya --> D[Hitung daysSinceSurvey]
    D --> E{daysDiff >= 3?}
    E -- Tidak --> F[Rule H2 atau skip]
    E -- Ya --> G[Catat QUOTATION_LATE_H3]
    G --> H[Hitung poin dan SP]
~~~

---

## 12. DOC_NOT_UPLOADED

Status pemicu: WORKEND, REWORKEND, WORKENDSTEPONE, WORKENDSTEPTWO, WORKENDSTEPTHREE.

~~~mermaid
flowchart TD
    A[Update status work order] --> B{Status selesai pengerjaan?}
    B -- Tidak --> C[Belum evaluasi dokumentasi]
    B -- Ya --> D[Simpan file before dan after]
    D --> E[Ambil evidence aktif]
    E --> F{Before type 2 tersedia?}
    F -- Tidak --> G[Catat DOC_NOT_UPLOADED]
    F -- Ya --> H{After type 3 tersedia?}
    H -- Tidak --> G
    H -- Ya --> I[Tidak ada pelanggaran]
    G --> J[Hitung poin dan SP]
~~~

SURVEYDONE tidak boleh menjadi trigger dokumentasi pengerjaan.

Jika log DOC sudah tercatat sebelumnya, upload berikutnya tidak otomatis mencabut log tersebut.

---

## 13. STATUS_NOT_UPDATED_H1

Status yang diawasi: WORKSTART, TUKANGWORK, TUKANGWORKSTEPONE, TUKANGWORKSTEPTWO, TUKANGWORKSTEPTHREE.

Basis waktu: work_order_status.created_at terbaru.

~~~mermaid
flowchart TD
    A[Daily scheduler] --> B[Ambil work order aktif]
    B --> C{Status active?}
    C -- Tidak --> Z[Skip]
    C -- Ya --> D[Ambil status history terbaru]
    D --> E[Hitung daysSinceUpdate]
    E --> F{daysSinceUpdate == 1?}
    F -- Tidak --> G[Rule H_PLUS atau skip]
    F -- Ya --> H[Catat STATUS_NOT_UPDATED_H1]
    H --> I[Hitung poin dan SP]
~~~

---

## 14. STATUS_NOT_UPDATED_H_PLUS

~~~mermaid
flowchart TD
    A[Daily scheduler] --> B[Ambil work order active]
    B --> C[Ambil work_order_status terbaru]
    C --> D[Hitung daysSinceUpdate]
    D --> E{daysSinceUpdate >= 2?}
    E -- Tidak --> F[Rule H1 atau skip]
    E -- Ya --> G[Catat STATUS_NOT_UPDATED_H_PLUS]
    G --> H[Hitung poin dan SP]
~~~

---

## Flow penerbitan SP

| Level | Total poin |
|---|---:|
| Tidak ada SP | 0 |
| SP1 | 1-25 |
| SP2 | 26-50 |
| SP3 | >= 51 |

~~~mermaid
flowchart TD
    A[Violation log berhasil dibuat] --> B[Total poin quarter]
    B --> C{Total >= 51?}
    C -- Ya --> D[SP3]
    C -- Tidak --> E{Total >= 26?}
    E -- Ya --> F[SP2]
    E -- Tidak --> G{Total >= 1?}
    G -- Ya --> H[SP1]
    G -- Tidak --> I[Tidak ada SP]
    D --> J[Vendor inactive]
    F --> K[Create/update vendor_sp]
    H --> K
    K --> L[Sync vendor_sp_detail]
    L --> M{SP3 baru?}
    M -- Ya --> N[Notif SP3]
    M -- Tidak --> O[Selesai]
~~~

## Audit kasus pelanggaran

Periksa:

1. vendor_violation_log.created_at
2. Kode violation type.
3. evidence_path.
4. order_id.
5. Snapshot checkType.
6. is_active.
7. vendor_sp.total_point.
8. vendor_sp.sp_level.
9. vendor_sp_detail.

Untuk membedakan sumber:

~~~text
snapshot.checkType = checkUnconfirmedOrders
→ dibuat scheduler

snapshot.checkType = checkLateQuotations
→ dibuat scheduler quotation

snapshot tanpa checkType tersebut
→ kemungkinan dibuat dari event service
~~~

Untuk dokumentasi:

~~~text
DOC tercatat sebelum WORKEND
→ kandidat false positive

DOC tercatat saat WORKEND tanpa evidence type 2 atau 3
→ kandidat valid, perlu cek upload dan database
~~~

