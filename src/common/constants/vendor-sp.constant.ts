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
    threshold = SPThreshold.SP3; // 51
  } else {
    targetSpLevel = 2;
    threshold = SPThreshold.SP2; // 26
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
