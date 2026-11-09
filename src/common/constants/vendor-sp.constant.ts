import { SPThreshold } from '../enum/violation-type.enum';

/**
 * Persentase threshold untuk peringatan SP mingguan (Poin 7 SP Vendor).
 * Nilai default: 70% (0.7).
 * - Target SP2 (threshold 26): ceil(26 * 0.7) = 19 poin
 * - Target SP3 (threshold 51): ceil(51 * 0.7) = 36 poin
 *
 * Simpan sebagai SATU konstanta terpusat agar mudah diubah jika kebijakan berubah.
 */
export const WARNING_THRESHOLD_PERCENTAGE = 0.7;

export interface SPWarningEvaluation {
  shouldWarn: boolean;
  targetSpLevel?: number;
  threshold?: number;
  warningThreshold?: number;
  toleranceRemaining?: number;
  reason?: string;
}

/**
 * Evaluasi apakah vendor mendekati threshold SP berikutnya.
 *
 * Aturan:
 * 1. Vendor tidak aktif -> tidak kena warning
 * 2. Total poin <= 0 (bersih) -> tidak kena warning
 * 3. Vendor sudah SP3 (atau poin >= 51) -> tidak kena warning
 * 4. Jika SP aktif saat ini SP2 (atau poin >= 26):
 *    - Target SP berikutnya = SP3 (threshold 51)
 *    - Batas warning = ceil(51 * WARNING_THRESHOLD_PERCENTAGE) = 36 poin
 * 5. Jika SP aktif saat ini SP1 atau belum ber-SP (poin < 26):
 *    - Target SP berikutnya = SP2 (threshold 26)
 *    - Batas warning = ceil(26 * WARNING_THRESHOLD_PERCENTAGE) = 19 poin
 * 6. Jika total poin >= warningThreshold dan < threshold -> shouldWarn = true
 */
export function evaluateSPWarning(
  totalPoints: number,
  currentSpLevel?: number | null,
  isVendorActive: boolean = true,
): SPWarningEvaluation {
  if (!isVendorActive) {
    return { shouldWarn: false, reason: 'Vendor is inactive' };
  }

  if (totalPoints <= 0) {
    return { shouldWarn: false, reason: 'Vendor has 0 violation points' };
  }

  if (currentSpLevel === 3 || totalPoints >= SPThreshold.SP3) {
    return { shouldWarn: false, reason: 'Vendor already reached SP3' };
  }

  let targetSpLevel: number;
  let threshold: number;

  if (currentSpLevel === 2 || totalPoints >= SPThreshold.SP2) {
    targetSpLevel = 3;
    threshold = SPThreshold.SP3;
  } else if (currentSpLevel === 1 || totalPoints >= SPThreshold.SP1) {
    targetSpLevel = 2;
    threshold = SPThreshold.SP2;
  } else {
    targetSpLevel = 1;
    threshold = SPThreshold.SP1;
  }

  const warningThreshold = Math.ceil(threshold * WARNING_THRESHOLD_PERCENTAGE);

  if (totalPoints >= warningThreshold && totalPoints < threshold) {
    return {
      shouldWarn: true,
      targetSpLevel,
      threshold,
      warningThreshold,
      toleranceRemaining: threshold - totalPoints,
    };
  }

  return {
    shouldWarn: false,
    targetSpLevel,
    threshold,
    warningThreshold,
    toleranceRemaining: threshold - totalPoints,
    reason: `Points (${totalPoints}) below warning threshold (${warningThreshold})`,
  };
}

/**
 * Hitung minggu ISO dan tahun ISO dari sebuah tanggal.
 */
export function getIsoWeekAndYear(date: Date = new Date()): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

/**
 * Dapatkan rentang waktu (Senin 00:00:00 sampai Minggu 23:59:59.999)
 * untuk minggu ISO dari tanggal yang diberikan.
 */
export function getIsoWeekRange(date: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Minggu, 1 = Senin, ...
  const diffToMonday = (day === 0 ? -6 : 1) - day;

  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday };
}

/**
 * Dapatkan tanggal mulai (tanggal 1 bulan pertama quarter) dan tanggal selesai
 * (hari terakhir bulan ketiga quarter) berdasarkan quarter (1..4) dan year.
 * - Q1: 1 Jan - 31 Mar
 * - Q2: 1 Apr - 30 Jun
 * - Q3: 1 Jul - 30 Sep
 * - Q4: 1 Okt - 31 Des
 */
export function getQuarterDateRange(
  quarter: number,
  year: number,
): { startDate: Date; endDate: Date } {
  const validQuarter = Math.min(4, Math.max(1, Number(quarter) || 1));
  const validYear = Number(year) || new Date().getFullYear();
  const startMonth = (validQuarter - 1) * 3;
  const startDate = new Date(validYear, startMonth, 1, 0, 0, 0, 0);
  const endDate = new Date(validYear, validQuarter * 3, 0, 23, 59, 59, 999);
  return { startDate, endDate };
}

export interface ViolationTypeRuleItem {
  code: string;
  name: string;
  point: number;
  category: string;
  description?: string | null;
}

export const VENDOR_SP_POLICY_RULES = {
  statusNote: 'MENUNGGU KONFIRMASI BISNIS',
  evaluationPeriod: 'Kuartalan (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Okt-Des)',
  spLevels: {
    SP1: {
      minPoint: SPThreshold.SP1,
      maxPoint: SPThreshold.SP2 - 1,
      allocationReductionPercent: 50,
      sanction: 'Surat Peringatan 1 & pemotongan alokasi order 50%',
    },
    SP2: {
      minPoint: SPThreshold.SP2,
      maxPoint: SPThreshold.SP3 - 1,
      allocationReductionPercent: 75,
      sanction: 'Surat Peringatan 2 & pemotongan alokasi order 75%',
    },
    SP3: {
      minPoint: SPThreshold.SP3,
      maxPoint: null as number | null,
      allocationReductionPercent: 100,
      sanction: 'Surat Peringatan 3 & suspend/nonaktif sementara (alokasi dipotong 100%)',
    },
  },
  warningThresholdPercentage: Math.round(WARNING_THRESHOLD_PERCENTAGE * 100),
  warningThresholds: {
    towardsSp2: Math.ceil(SPThreshold.SP2 * WARNING_THRESHOLD_PERCENTAGE),
    towardsSp3: Math.ceil(SPThreshold.SP3 * WARNING_THRESHOLD_PERCENTAGE),
  },
  quotationSla: {
    lateH2Days: 2,
    lateH3Days: 3,
    validityDays: 8,
    draftStopsTimer: false,
    description:
      'Batas pengiriman Quotation pasca SURVEYDONE: keterlambatan H+2 (QUOTATION_LATE_H2) dan H+3 (QUOTATION_LATE_H3) dikenai poin pelanggaran. Status Draft/Revisi tidak menghentikan timer.',
  },
  warrantyDays: 7,
} as const;

export const DEFAULT_VENDOR_VIOLATION_TYPES: ViolationTypeRuleItem[] = [
  { code: 'ORDER_NOT_RESPONDED', name: 'Tidak Merespon Order', point: 3, category: 'ORDER' },
  { code: 'ORDER_REJECTED', name: 'Menolak Order', point: 5, category: 'ORDER' },
  { code: 'SURVEY_LATE', name: 'Terlambat Survey', point: 3, category: 'SURVEY' },
  { code: 'QUOTATION_LATE_H2', name: 'Terlambat Kirim Quotation H+2', point: 2, category: 'QUOTATION' },
  { code: 'QUOTATION_LATE_H3', name: 'Terlambat Kirim Quotation H+3', point: 5, category: 'QUOTATION' },
  { code: 'RESCHEDULE_BY_VENDOR', name: 'Reschedule oleh Vendor', point: 2, category: 'WORK_ORDER' },
  { code: 'WORK_LATE', name: 'Terlambat Pengerjaan (Work Order)', point: 5, category: 'WORK_ORDER' },
  { code: 'BAST_NO_EVIDENCE', name: 'BAST Tanpa Foto Bukti (Evidence)', point: 3, category: 'BAST' },
  { code: 'COMPLAINT_VALID', name: 'Komplain Terbukti Valid', point: 5, category: 'COMPLAINT' },
  { code: 'REMEDIAL_REPEAT', name: 'Remedial Berulang', point: 5, category: 'COMPLAINT' },
  { code: 'WARRANTY_REJECTED', name: 'Menolak Klaim Garansi Valid', point: 10, category: 'WARRANTY' },
  { code: 'SOP_VIOLATION', name: 'Pelanggaran SOP Lapangan / K3', point: 5, category: 'SOP' },
  { code: 'OFF_PLATFORM_TRANSACTION', name: 'Transaksi di Luar Platform (Bypass)', point: 25, category: 'FRAUD' },
  { code: 'FAKE_DOCUMENT', name: 'Pemalsuan Dokumen / Bukti Pekerjaan', point: 25, category: 'FRAUD' },
  { code: 'CUSTOMER_ABUSE', name: 'Perilaku Buruk terhadap Pelanggan', point: 15, category: 'ETIKA' },
];

export function buildSpAndSlaPolicyText(
  rules = VENDOR_SP_POLICY_RULES,
  violationTypes: ViolationTypeRuleItem[] = DEFAULT_VENDOR_VIOLATION_TYPES,
): string {
  const { spLevels, warningThresholdPercentage, warningThresholds, quotationSla, warrantyDays, statusNote } = rules;
  const violationLines = violationTypes
    .map((v, idx) => `${idx + 1}. ${v.code} (${v.name}): +${v.point} poin [${v.category}]`)
    .join('\n');

  return [
    `ATURAN RESMI SP VENDOR & SLA QUOTATION [${statusNote}]:`,
    `- Evaluasi dilakukan per kuartal (${rules.evaluationPeriod}).`,
    `- SP 1: ${spLevels.SP1.minPoint} s/d ${spLevels.SP1.maxPoint} poin (${spLevels.SP1.sanction}).`,
    `- SP 2: ${spLevels.SP2.minPoint} s/d ${spLevels.SP2.maxPoint} poin (${spLevels.SP2.sanction}).`,
    `- SP 3: >= ${spLevels.SP3.minPoint} poin (${spLevels.SP3.sanction}).`,
    `- Peringatan Dini (Early Warning ${warningThresholdPercentage}%): menuju SP2 pada ${warningThresholds.towardsSp2} poin, menuju SP3 pada ${warningThresholds.towardsSp3} poin.`,
    `- SLA Quotation: keterlambatan H+${quotationSla.lateH2Days} (QUOTATION_LATE_H2) dan H+${quotationSla.lateH3Days} (QUOTATION_LATE_H3) pasca SURVEYDONE dikenai poin pelanggaran; masa berlaku penawaran ${quotationSla.validityDays} hari; status Draft/Revisi tidak menghentikan timer.`,
    `- Masa Garansi Pekerjaan pasca BAST (COMPLETED): ${warrantyDays} hari kalender.`,
    '',
    `DAFTAR ${violationTypes.length} JENIS PELANGGARAN VENDOR (vendor_violation_type):`,
    violationLines,
  ].join('\n');
}

