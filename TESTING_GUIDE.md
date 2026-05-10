# Testing Guide - Vendor SP & Registration System

## Prerequisites

1. **Start the API server:**
   ```bash
   cd mitra10-tukang-api
   npm run start:dev
   ```

2. **Access Swagger UI:**
   - Open: `http://localhost:3000/api`
   - All endpoints documented with request/response schemas

3. **Get Authentication Token:**
   - Login via `/auth/login` endpoint
   - Use the token in `Authorization: Bearer <token>` header for protected endpoints

---

## Test Data dari Seed

### Vendors
| Vendor ID | Company Name | Status | SP Level |
|----------|-------------|--------|----------|
| 1 | CV. Pasang Lantai Jaya | Active | Normal (0 poin) |
| 2 (actually ID 3 from seed) | PT. Pasang Dinding Prima | Active | SP1 (2 poin) |
| 3 (actually ID 2 from seed) | UD. Service Elektronik Bersama | Inactive | SP3 (52 poin) |

### Users
| Username | Password | Role |
|----------|----------|------|
| admin_ho | admin123 | Super User |
| vendor_owner_1 | password123 | Owner Vendor |

---

## Part 1: Vendor Registration Flow

### Flow Overview
```
[Vendor Registration Form]
       ↓
[POST /vendor-registration/register]
       ↓
[System sends email with token]
       ↓
[GET /vendor-registration/validate-token?token=xxx]
       ↓
[POST /vendor-registration/create-user]
       ↓
[Vendor Active - Can login]
```

### Test Cases

#### TC-REG-001: Vendor Registration (New Vendor)
**Endpoint:** `POST /vendor-registration/register`

**Request Body:**
```json
{
  "company_name": "CV. Baru sekali",
  "address": "Jl. Pendaftaran Test No. 1",
  "phone_number": "081299988877",
  "email_address": "vendor.baru@test.com",
  "pic_name": "Test Vendor PIC",
  "pic_email": "pic@vendor.test.com",
  "pic_phone": "081299988877",
  "ktp_number": "3201234567890001",
  "npwp_number": "012345678901234",
  "bank_id": 1,
  "service_types": [1, 2],
  "areas": [1, 2]
}
```

**Expected Response:**
```json
{
  "statusCode": 201,
  "message": "Pendaftaran vendor berhasil. Silakan cek email untuk token verifikasi.",
  "data": {
    "id": <new_registration_id>,
    "company_name": "CV. Baru sekali",
    "status": 1,
    "registration_token": "<uuid_token>",
    ...
  }
}
```

#### TC-REG-002: Validate Registration Token
**Endpoint:** `GET /vendor-registration/validate-token`

**Query Parameters:**
- `token` - Registration token from email (use token from TC-REG-001 response)

**Expected Response:**
```json
{
  "statusCode": 200,
  "data": {
    "is_valid": true,
    "registration": {
      "id": <registration_id>,
      "company_name": "CV. Baru sekali",
      "status": 1,
      ...
    }
  }
}
```

#### TC-REG-003: Create User from Token
**Endpoint:** `POST /vendor-registration/create-user`

**Request Body:**
```json
{
  "token": "<registration_token>",
  "username": "vendor_baru_user",
  "password": "securePassword123"
}
```

**Expected Response:**
```json
{
  "statusCode": 201,
  "message": "User berhasil dibuat. Vendor sekarang aktif.",
  "data": {
    "user_id": <user_id>,
    "vendor_id": <vendor_id>,
    "username": "vendor_baru_user",
    ...
  }
}
```

#### TC-REG-004: Approve Pending Registration (Admin)
**Endpoint:** `PUT /vendor-registration/:id/approve`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "vendor_store": [1, 2],
  "max_order": 5,
  "notes": "Vendor disetujui setelah review dokumen"
}
```

**Expected Response:**
```json
{
  "statusCode": 200,
  "message": "Pendaftaran vendor berhasil disetujui",
  "data": {
    "id": <registration_id>,
    "status": 2,
    "approved_at": "2024-04-26T...",
    ...
  }
}
```

#### TC-REG-005: Reject Pending Registration (Admin)
**Endpoint:** `PUT /vendor-registration/:id/reject`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "rejection_reason": "Dokumen tidak lengkap",
  "notes": "Mohon lengkapi KTP dan NPWP"
}
```

**Expected Response:**
```json
{
  "statusCode": 200,
  "message": "Pendaftaran vendor ditolak",
  "data": {
    "id": <registration_id>,
    "status": 3,
    "rejection_reason": "Dokumen tidak lengkap",
    ...
  }
}
```

#### TC-REG-006: Get Registration Statistics
**Endpoint:** `GET /vendor-registration/stats`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Expected Response:**
```json
{
  "statusCode": 200,
  "data": {
    "total": 10,
    "pending": 2,
    "approved": 7,
    "rejected": 1
  }
}
```

---

## Part 2: Vendor SP (Surat Peringatan) Flow

### Flow Overview
```
[Violation Occurs]
       ↓
[POST /vendor-violation/log] ← Record violation
       ↓
[System calculates total points]
       ↓
[If points >= threshold]
       ↓
[System auto-creates SP]
       ↓
[GET /vendor-sp/vendor/:vendorId] ← Check SP status
```

### SP Threshold Rules
| SP Level | Points Threshold | Action |
|----------|-----------------|--------|
| SP1 | 1-25 points | Warning + 50% allocation reduction |
| SP2 | 26-50 points | Final Warning + 75% allocation reduction |
| SP3 | >50 points | Deactivation + 100% allocation reduction |

### Test Cases

#### TC-SP-001: Record Violation - Order Not Confirmed
**Endpoint:** `POST /vendor-violation/log`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "vendor_id": 1,
  "violation_type_id": 1,
  "order_id": 1,
  "description": "Vendor tidak mengkonfirmasi order pada Hari H",
  "evidence_path": "/uploads/evidence/screenshot1.png"
}
```

**Expected Response:**
```json
{
  "statusCode": 201,
  "message": "Pelanggaran berhasil dicatat",
  "data": {
    "id": <violation_log_id>,
    "vendor_id": 1,
    "violation_type_id": 1,
    "quarter": 2,
    "year": 2026,
    ...
  }
}
```

#### TC-SP-002: Get Vendor Quarter Points
**Endpoint:** `GET /vendor-violation/vendor/:vendorId/points`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Path Parameters:**
- `vendorId` - Vendor ID (e.g., 1)

**Query Parameters:**
- `quarter` (optional) - Quarter number (1-4), defaults to current
- `year` (optional) - Year, defaults to current

**Expected Response:**
```json
{
  "statusCode": 200,
  "data": {
    "vendor_id": 1,
    "quarter": 2,
    "year": 2026,
    "total_points": 5,
    "violation_count": 5,
    "violations": [
      {
        "id": 1,
        "violation_type": {
          "code": "ORDER_NOT_CONFIRMED_H",
          "name": "Order tidak terkonfirmasi pada Hari H",
          "point": 1
        },
        "created_at": "2026-04-26T..."
      }
    ],
    "current_sp": null,
    "next_sp_level": 1,
    "points_until_next_sp": 21
  }
}
```

#### TC-SP-003: Check Vendor SP Status
**Endpoint:** `GET /vendor-sp/check/:vendorId`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Path Parameters:**
- `vendorId` - Vendor ID (e.g., 1)

**Expected Response (No Active SP):**
```json
{
  "statusCode": 200,
  "data": {
    "has_active_sp": false,
    "current_sp": null,
    "total_points_current_quarter": 5,
    "vendor_status": "ACTIVE",
    "message": "Vendor tidak memiliki SP aktif"
  }
}
```

**Expected Response (Has Active SP):**
```json
{
  "statusCode": 200,
  "data": {
    "has_active_sp": true,
    "current_sp": {
      "id": 1,
      "sp_level": 1,
      "total_point": 25,
      "start_date": "2026-04-01T00:00:00.000Z",
      "end_date": "2026-06-30T00:00:00.000Z",
      "status": 1,
      "allocation_reduction": 50
    },
    "total_points_current_quarter": 25,
    "vendor_status": "SP1_ACTIVE",
    "message": "Vendor memiliki SP1 aktif"
  }
}
```

#### TC-SP-004: Get All SP Records (Paginated)
**Endpoint:** `GET /vendor-sp`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Query Parameters:**
- `page` (optional, default: 1)
- `take` (optional, default: 10)
- `vendor_id` (optional) - Filter by vendor
- `sp_level` (optional) - Filter by SP level (1, 2, or 3)
- `status` (optional) - Filter by status (0=Inactive, 1=Active)
- `quarter` (optional) - Filter by quarter
- `year` (optional) - Filter by year
- `date_from` (optional) - Filter from date (YYYY-MM-DD)
- `date_to` (optional) - Filter to date (YYYY-MM-DD)
- `search` (optional) - Search by vendor name

**Expected Response:**
```json
{
  "statusCode": 200,
  "data": {
    "items": [
      {
        "id": 1,
        "vendor": {
          "id": 1,
          "company_name": "CV. Pasang Lantai Jaya"
        },
        "sp_level": 1,
        "total_point": 25,
        "quarter": 2,
        "year": 2026,
        "start_date": "2026-04-01T00:00:00.000Z",
        "end_date": "2026-06-30T00:00:00.000Z",
        "status": 1,
        "allocation_reduction": 50
      }
    ],
    "meta": {
      "page": 1,
      "take": 10,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

#### TC-SP-005: Get SP Records by Vendor
**Endpoint:** `GET /vendor-sp/vendor/:vendorId`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Path Parameters:**
- `vendorId` - Vendor ID

**Expected Response:**
```json
{
  "statusCode": 200,
  "data": [
    {
      "id": 1,
      "sp_level": 1,
      "total_point": 25,
      "quarter": 2,
      "year": 2026,
      "start_date": "2026-04-01T00:00:00.000Z",
      "end_date": "2026-06-30T00:00:00.000Z",
      "status": 1,
      "allocation_reduction": 50
    },
    {
      "id": 2,
      "sp_level": 1,
      "total_point": 15,
      "quarter": 1,
      "year": 2026,
      "start_date": "2026-01-01T00:00:00.000Z",
      "end_date": "2026-03-31T00:00:00.000Z",
      "status": 0,
      "allocation_reduction": 50
    }
  ]
}
```

#### TC-SP-006: Extend SP Duration
**Endpoint:** `PUT /vendor-sp/extend/:id`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Path Parameters:**
- `id` - SP ID

**Request Body:**
```json
{
  "end_date": "2026-07-30"
}
```

**Expected Response:**
```json
{
  "statusCode": 200,
  "message": "Durasi SP berhasil diperpanjang",
  "data": {
    "id": 1,
    "end_date": "2026-07-30T00:00:00.000Z",
    "extended_by": 1,
    "extended_at": "2026-04-26T..."
  }
}
```

#### TC-SP-007: Complete/Mark SP as Finished
**Endpoint:** `PUT /vendor-sp/complete/:id`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Path Parameters:**
- `id` - SP ID

**Expected Response:**
```json
{
  "statusCode": 200,
  "message": "SP berhasil ditandai selesai",
  "data": {
    "id": 1,
    "status": 2,
    "completed_at": "2026-04-26T...",
    "completed_by": 1
  }
}
```

#### TC-SP-008: Reactivate Vendor after SP3
**Endpoint:** `POST /vendor-sp/reactivate`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "vendor_id": 3,
  "previous_sp_id": 5,
  "reason": "Vendor telah menyelesaikan masa SP3 dan menunjukkan perbaikan"
}
```

**Expected Response:**
```json
{
  "statusCode": 201,
  "message": "Vendor berhasil diaktifkan kembali",
  "data": {
    "vendor_id": 3,
    "is_active": true,
    "reactivated_at": "2026-04-26T...",
    "reactivated_by": 1,
    "previous_sp": {
      "id": 5,
      "sp_level": 3,
      "status": 2
    }
  }
}
```

#### TC-SP-009: Get Reactivation Logs
**Endpoint:** `GET /vendor-sp/reactivation`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Query Parameters:**
- `vendor_id` (optional) - Filter by vendor

**Expected Response:**
```json
{
  "statusCode": 200,
  "data": [
    {
      "id": 1,
      "vendor_id": 3,
      "previous_sp_id": 5,
      "reason": "Vendor telah menyelesaikan masa SP3",
      "reactivated_by": 1,
      "reactivated_at": "2026-04-26T..."
    }
  ]
}
```

---

## Part 3: Violation Type Management

### Test Cases

#### TC-VT-001: Get All Violation Types
**Endpoint:** `GET /vendor-violation/type`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Query Parameters:**
- `page` (optional)
- `take` (optional)
- `search` (optional) - Search by code, name, description
- `category` (optional) - Filter by category
- `is_active` (optional) - Filter by active status

**Expected Response:**
```json
{
  "statusCode": 200,
  "data": {
    "items": [
      {
        "id": 1,
        "code": "ORDER_NOT_CONFIRMED_H",
        "category": "KONFIRMASI_ORDER",
        "name": "Order tidak terkonfirmasi pada Hari H",
        "description": "Vendor tidak mengkonfirmasi order pada tanggal yang dijadwalkan",
        "point": 1,
        "is_active": true
      }
    ],
    "meta": { ... }
  }
}
```

#### TC-VT-002: Create New Violation Type
**Endpoint:** `POST /vendor-violation/type`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "code": "NEW_VIOLATION_TEST",
  "category": "LAINNYA",
  "name": "Test Violation Type",
  "description": "Violation type untuk testing",
  "point": 5
}
```

**Expected Response:**
```json
{
  "statusCode": 201,
  "message": "Tipe pelanggaran berhasil dibuat",
  "data": {
    "id": <new_violation_type_id>,
    "code": "NEW_VIOLATION_TEST",
    ...
  }
}
```

#### TC-VT-003: Update Violation Type
**Endpoint:** `PUT /vendor-violation/type/:id`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "point": 3,
  "description": "Updated description"
}
```

**Expected Response:**
```json
{
  "statusCode": 200,
  "message": "Tipe pelanggaran berhasil diperbarui",
  "data": { ... }
}
```

#### TC-VT-004: Deactivate Violation Type
**Endpoint:** `DELETE /vendor-violation/type/:id`

**Headers:**
- `Authorization: Bearer <admin_token>`

**Expected Response:**
```json
{
  "statusCode": 200,
  "message": "Tipe pelanggaran berhasil dihapus"
}
```

---

## Part 4: Integration Test - Full Flow

### Scenario: Complete Vendor SP Lifecycle

#### Step 1: Register New Vendor
```
POST /vendor-registration/register
→ Save registration_token from response
```

#### Step 2: Validate Token
```
GET /vendor-registration/validate-token?token=<token>
→ Verify token is valid
```

#### Step 3: Create User
```
POST /vendor-registration/create-user
{
  "token": "<token>",
  "username": "new_vendor_user",
  "password": "password123"
}
→ Vendor is now active
```

#### Step 4: Login as Vendor
```
POST /auth/login
{
  "username": "new_vendor_user",
  "password": "password123"
}
→ Save access_token
```

#### Step 5: Record Violations (Simulate)
```
POST /vendor-violation/log
Headers: Authorization: Bearer <admin_token>
{
  "vendor_id": <new_vendor_id>,
  "violation_type_id": 1,
  "order_id": 1,
  "description": "Test violation 1"
}

POST /vendor-violation/log
{
  "vendor_id": <new_vendor_id>,
  "violation_type_id": 2,
  "order_id": 2,
  "description": "Test violation 2"
}
```

#### Step 6: Check Points
```
GET /vendor-violation/vendor/<vendor_id>/points?quarter=2&year=2026
→ Verify total_points = 2
```

#### Step 7: Check SP Status
```
GET /vendor-sp/check/<vendor_id>
→ Should return has_active_sp: false (points < 25)
```

#### Step 8: Add More Violations (Trigger SP1)
```
# Record 23 more violations (total 25 points)
POST /vendor-violation/log
... (repeat 23 times)
```

#### Step 9: Verify SP1 Created
```
GET /vendor-sp/vendor/<vendor_id>
→ Should show SP1 with status: 1 (active)
```

#### Step 10: Vendor Has SP1
```
GET /vendor-sp/check/<vendor_id>
→ Should show:
{
  "has_active_sp": true,
  "current_sp": {
    "sp_level": 1,
    "status": 1,
    "allocation_reduction": 50
  }
}
```

---

## Part 5: Scheduler/Cron Job Testing

### Daily Violation Check
The scheduler runs daily to check for violations that need to be recorded.

### Quarterly Reset
At the end of each quarter, the scheduler:
1. Checks if vendors have SP active for >12 weeks before quarter end
2. If not, resets points to 0 for new quarter

### SP Status Checker
The scheduler runs periodically to:
1. Complete SPs that have passed their end_date
2. Reactivate vendors whose SP3 has expired naturally

**To test manually:**
```bash
# The scheduler runs automatically based on cron expressions
# Check logs for scheduler activity
```

---

## Appendix: Violation Type Codes Reference

| Code | Category | Name | Point |
|------|----------|------|-------|
| ORDER_NOT_CONFIRMED_H | KONFIRMASI_ORDER | Order tidak terkonfirmasi pada Hari H | 1 |
| ORDER_NOT_CONFIRMED_H1 | KONFIRMASI_ORDER | Order tidak terkonfirmasi pada H+1 | 1 |
| ORDER_NOT_CONFIRMED_H_PLUS | KONFIRMASI_ORDER | Order tidak terkonfirmasi pada >H+1 | 1 |
| RESCHEDULE_NOT_UPDATED | RESCHEDULE | Tidak update status sejak reschedule diajukan | 1 |
| RESCHEDULE_CHANGE_SCHEDULE | RESCHEDULE | Mengubah jadwal saat hari pelaksanaan | 1 |
| REFUND_5_PER_QUARTER | REFUND | 5 order refund per quarter | 1 |
| REFUND_6_10_PER_QUARTER | REFUND | 6-10 order refund per quarter | 1 |
| CUSTOMER_COMPLAINT | LAINNYA | Komplain customer | 1 |
| QUOTATION_NOT_FULFILLED | LAINNYA | Tidak memenuhi quotation | 1 |
| QUOTATION_LATE_H2 | LAINNYA | Quotation terbit > H+2 | 1 |
| QUOTATION_LATE_H3 | LAINNYA | Quotation terbit > H+3 | 1 |
| DOC_NOT_UPLOADED | LAINNYA | Tidak upload dokumentasi | 1 |
| STATUS_NOT_UPDATED_H | LAINNYA | Tidak update status pada Hari H | 1 |
| STATUS_NOT_UPDATED_H1 | LAINNYA | Tidak update status pada H+1 | 1 |
| STATUS_NOT_UPDATED_H_PLUS | LAINNYA | Tidak update status pada >H+2 | 1 |

---

## Common Issues & Troubleshooting

### Issue: 401 Unauthorized
- **Cause:** Token expired or not provided
- **Solution:** Login again via `/auth/login` and include `Authorization: Bearer <token>`

### Issue: 404 Not Found
- **Cause:** Vendor/SP/Violation ID doesn't exist
- **Solution:** Verify the ID exists via GET endpoints first

### Issue: 400 Bad Request
- **Cause:** Invalid request body format
- **Solution:** Check Swagger documentation for required fields and formats

### Issue: SP not auto-created
- **Cause:** ViolationDetectorService may have issues
- **Solution:** Check logs for ViolationDetectorService errors, verify trigger integration in order/quotation/work_orders services
