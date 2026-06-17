/**
 * Enum untuk kode jenis pelanggaran vendor
 * Kode ini harus sesuai dengan data di tabel vendor_violation_type
 */
export enum ViolationTypeCode {
  // KATEGORI: KONFIRMASI ORDER
  ORDER_NOT_CONFIRMED_H = 'ORDER_NOT_CONFIRMED_H',
  ORDER_NOT_CONFIRMED_H1 = 'ORDER_NOT_CONFIRMED_H1',
  ORDER_NOT_CONFIRMED_H_PLUS = 'ORDER_NOT_CONFIRMED_H_PLUS',

  // KATEGORI: RESCHEDULE
  RESCHEDULE_NOT_UPDATED = 'RESCHEDULE_NOT_UPDATED',
  RESCHEDULE_CHANGE_SCHEDULE = 'RESCHEDULE_CHANGE_SCHEDULE',

  // KATEGORI: REFUND
  REFUND_5_PER_QUARTER = 'REFUND_5_PER_QUARTER',
  REFUND_6_10_PER_QUARTER = 'REFUND_6_10_PER_QUARTER',

  // KATEGORI: LAINNYA
  CUSTOMER_COMPLAINT = 'CUSTOMER_COMPLAINT',
  QUOTATION_NOT_FULFILLED = 'QUOTATION_NOT_FULFILLED',
  QUOTATION_LATE_H2 = 'QUOTATION_LATE_H2',
  QUOTATION_LATE_H3 = 'QUOTATION_LATE_H3',
  DOC_NOT_UPLOADED = 'DOC_NOT_UPLOADED',
  STATUS_NOT_UPDATED_H = 'STATUS_NOT_UPDATED_H',
  STATUS_NOT_UPDATED_H1 = 'STATUS_NOT_UPDATED_H1',
  STATUS_NOT_UPDATED_H_PLUS = 'STATUS_NOT_UPDATED_H_PLUS',
}

/**
 * Kategori pelanggaran
 */
export enum ViolationCategory {
  KONFIRMASI_ORDER = 'KONFIRMASI_ORDER',
  RESCHEDULE = 'RESCHEDULE',
  REFUND = 'REFUND',
  LAINNYA = 'LAINNYA',
}

/**
 * Threshold poin untuk SP
 */
export enum SPThreshold {
  SP1 = 1,
  SP2 = 26,
  SP3 = 51,
}

/**
 * Durasi SP dalam hari
 */
export const SP_DURATION_DAYS = 90;

/**
 * Pengurangan alokasi per level SP (dalam persen)
 */
export enum SPAllocationReduction {
  SP1_MIN = 25,
  SP1_MAX = 50,
  SP2_MIN = 50,
  SP2_MAX = 75,
  SP3 = 100,
}

export enum ViolationRevisionType {
  REVISE = 'REVISE',
  RESET = 'RESET',
}

export enum ViolationRevisionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/**
 * Mapping kode pelanggaran ke violation_type_id di database
 * Ini akan di-resolve saat service dijalankan
 */
export const VIOLATION_TYPE_CACHE = new Map<string, number>();

/**
 * Context untuk pelanggaran
 */
export interface ViolationContext {
  vendorId: number;
  orderId?: number;
  quotationId?: number;
  workOrderId?: number;
  refundId?: number;
  complaintId?: number;
  description?: string;
  evidencePath?: string;
  additionalData?: Record<string, any>;
}

/**
 * Result dari pendeteksian pelanggaran
 */
export interface ViolationResult {
  success: boolean;
  violationLogId?: number;
  pointAdded: number;
  newTotalPoints: number;
  spIssued?: {
    spId: number;
    spLevel: number;
  };
  message: string;
}
