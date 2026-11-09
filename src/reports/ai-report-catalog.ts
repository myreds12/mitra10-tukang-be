export type AiSkillId =
  | 'auto'
  | 'order_and_revenue_analytics'
  | 'quotation_and_billing_report'
  | 'work_order_and_schedule'
  | 'vendor_sp_and_performance'
  | 'complaint_refund_and_warranty'
  | 'commission_and_incentive_report';

export type ReportCatalogParam =
  | 'date_from'
  | 'date_to'
  | 'quarter'
  | 'year'
  | 'status'
  | 'store_id'
  | 'vendor_id';

export interface ExtractedWibPeriod {
  date_from: string;
  date_to: string;
  quarter: number;
  year: number;
  label: string;
  isDefaultAssumption: boolean;
  assumptionNote: string;
}

export interface ReportCatalogItem {
  key: string;
  title: string;
  skill: Exclude<AiSkillId, 'auto'>;
  status: 'ready' | 'unavailable';
  sumber: string;
  allowedParams: ReportCatalogParam[];
  fieldWhitelist: string[];
  maxRows: number;
  keywords: string[];
  unavailableReason?: string;
  summarize: (rawResult: any, whitelistedRows: Record<string, any>[]) => Record<string, any>;
}

export interface AiSkillCatalogDefinition {
  id: Exclude<AiSkillId, 'auto'>;
  name: string;
  description: string;
  keywords: string[];
  defaultReportKeys: string[];
}

const INDONESIAN_MONTHS: Record<string, number> = {
  januari: 1,
  jan: 1,
  februari: 2,
  feb: 2,
  pebruari: 2,
  maret: 3,
  mar: 3,
  april: 4,
  apr: 4,
  mei: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  agustus: 8,
  agu: 8,
  ags: 8,
  agt: 8,
  september: 9,
  sep: 9,
  sept: 9,
  oktober: 10,
  okt: 10,
  november: 11,
  nov: 11,
  nopember: 11,
  desember: 12,
  des: 12,
};

const MONTH_NAMES_ID = [
  '',
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

function formatIsoDate(year: number, month1To12: number, day: number): string {
  return `${year}-${pad2(month1To12)}-${pad2(day)}`;
}

function formatReadableDateId(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return `${d} ${MONTH_NAMES_ID[m] || m} ${y}`;
}

export function getWibDateParts(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  quarter: number;
} {
  const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  const year = wib.getUTCFullYear();
  const month = wib.getUTCMonth() + 1;
  const day = wib.getUTCDate();
  const quarter = Math.ceil(month / 3);
  return { year, month, day, quarter };
}

export function extractPeriodWib(userPrompt: string, now: Date = new Date()): ExtractedWibPeriod {
  const raw = String(userPrompt || '').trim();
  const lower = raw.toLowerCase();
  const wibNow = getWibDateParts(now);

  const explicitYearMatch = lower.match(/\b(202[0-9])\b/);
  const defaultYear = explicitYearMatch ? Number(explicitYearMatch[1]) : wibNow.year;

  const isoRangeMatch = lower.match(/\b(202\d-\d{2}-\d{2})\s*(?:s\/d|sd|sampai|hingga|-|to)\s*(202\d-\d{2}-\d{2})\b/);
  if (isoRangeMatch) {
    const date_from = isoRangeMatch[1];
    const date_to = isoRangeMatch[2];
    const y = Number(date_from.slice(0, 4)) || defaultYear;
    const m = Number(date_from.slice(5, 7)) || wibNow.month;
    const quarter = Math.ceil(m / 3);
    const label = `${formatReadableDateId(date_from)} s/d ${formatReadableDateId(date_to)}`;
    return {
      date_from,
      date_to,
      quarter,
      year: y,
      label,
      isDefaultAssumption: false,
      assumptionNote: `Periode eksplisit: ${label} (WIB).`,
    };
  }

  const quarterExplicit =
    lower.match(/\b(?:q|kuartal|quartal|triwulan)\s*([1-4])(?:\s*(?:tahun)?\s*(202\d))?\b/) ||
    lower.match(/\b(202\d)\s*(?:q|kuartal|quartal)\s*([1-4])\b/);

  if (quarterExplicit) {
    const isYearFirst = quarterExplicit[1].length === 4;
    const q = Number(isYearFirst ? quarterExplicit[2] : quarterExplicit[1]);
    const y = Number((isYearFirst ? quarterExplicit[1] : quarterExplicit[2]) || defaultYear);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const date_from = formatIsoDate(y, startMonth, 1);
    const date_to = formatIsoDate(y, endMonth, lastDayOfMonth(y, endMonth));
    const label = `Q${q} ${y} (${formatReadableDateId(date_from)} s/d ${formatReadableDateId(date_to)})`;
    return {
      date_from,
      date_to,
      quarter: q,
      year: y,
      label,
      isDefaultAssumption: false,
      assumptionNote: `Periode kuartal eksplisit: ${label}.`,
    };
  }

  if (/\b(kuartal|quartal|triwulan)\s+lalu\b/.test(lower)) {
    const prevQ = wibNow.quarter === 1 ? 4 : wibNow.quarter - 1;
    const y = wibNow.quarter === 1 ? wibNow.year - 1 : wibNow.year;
    const startMonth = (prevQ - 1) * 3 + 1;
    const endMonth = prevQ * 3;
    const date_from = formatIsoDate(y, startMonth, 1);
    const date_to = formatIsoDate(y, endMonth, lastDayOfMonth(y, endMonth));
    const label = `Q${prevQ} ${y} (${formatReadableDateId(date_from)} s/d ${formatReadableDateId(date_to)})`;
    return {
      date_from,
      date_to,
      quarter: prevQ,
      year: y,
      label,
      isDefaultAssumption: false,
      assumptionNote: `Periode kuartal lalu: ${label}.`,
    };
  }

  if (/\b(kuartal|quartal|triwulan)\s+(ini|berjalan|sekarang)\b/.test(lower)) {
    const q = wibNow.quarter;
    const y = wibNow.year;
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const date_from = formatIsoDate(y, startMonth, 1);
    const date_to = formatIsoDate(y, endMonth, lastDayOfMonth(y, endMonth));
    const label = `Q${q} ${y} (${formatReadableDateId(date_from)} s/d ${formatReadableDateId(date_to)})`;
    return {
      date_from,
      date_to,
      quarter: q,
      year: y,
      label,
      isDefaultAssumption: false,
      assumptionNote: `Periode kuartal berjalan: ${label}.`,
    };
  }

  const monthKeys = Object.keys(INDONESIAN_MONTHS).join('|');
  const monthRangeRegex = new RegExp(
    `\\b(${monthKeys})(?:\\s+(202\\d))?\\s*(?:(?:sampai|sampe)(?:\\s+dengan)?|s\\/d|sd|hingga|-|ke)\\s*(${monthKeys})(?:\\s+(202\\d))?\\b`,
    'i',
  );
  const monthRangeMatch = lower.match(monthRangeRegex);
  if (monthRangeMatch) {
    const m1 = INDONESIAN_MONTHS[monthRangeMatch[1].toLowerCase()];
    const m2 = INDONESIAN_MONTHS[monthRangeMatch[3].toLowerCase()];
    const y2 = Number(monthRangeMatch[4] || monthRangeMatch[2] || defaultYear);
    const y1 = Number(monthRangeMatch[2] || (m1 > m2 ? y2 - 1 : y2));
    const date_from = formatIsoDate(y1, m1, 1);
    const date_to = formatIsoDate(y2, m2, lastDayOfMonth(y2, m2));
    const quarter = Math.ceil(m2 / 3);
    const label = `${MONTH_NAMES_ID[m1]} ${y1} s/d ${MONTH_NAMES_ID[m2]} ${y2} (${formatReadableDateId(date_from)} s/d ${formatReadableDateId(date_to)})`;
    return {
      date_from,
      date_to,
      quarter,
      year: y2,
      label,
      isDefaultAssumption: false,
      assumptionNote: `Periode rentang bulan: ${label}.`,
    };
  }

  const singleMonthRegex = new RegExp(`\\b(?:bulan\\s+)?(${monthKeys})(?:\\s+(202\\d))?\\b`, 'i');
  const singleMonthMatch = lower.match(singleMonthRegex);
  if (singleMonthMatch) {
    const m = INDONESIAN_MONTHS[singleMonthMatch[1].toLowerCase()];
    const y = Number(singleMonthMatch[2] || defaultYear);
    const date_from = formatIsoDate(y, m, 1);
    const date_to = formatIsoDate(y, m, lastDayOfMonth(y, m));
    const quarter = Math.ceil(m / 3);
    const label = `${MONTH_NAMES_ID[m]} ${y} (${formatReadableDateId(date_from)} s/d ${formatReadableDateId(date_to)})`;
    return {
      date_from,
      date_to,
      quarter,
      year: y,
      label,
      isDefaultAssumption: false,
      assumptionNote: `Periode bulan: ${label}.`,
    };
  }

  if (/\bhari\s+ini\b/.test(lower)) {
    const iso = formatIsoDate(wibNow.year, wibNow.month, wibNow.day);
    const label = `Hari ini (${formatReadableDateId(iso)})`;
    return {
      date_from: iso,
      date_to: iso,
      quarter: wibNow.quarter,
      year: wibNow.year,
      label,
      isDefaultAssumption: false,
      assumptionNote: `Periode: ${label}.`,
    };
  }

  if (/\bkemarin\b/.test(lower)) {
    const yesterday = new Date(Date.UTC(wibNow.year, wibNow.month - 1, wibNow.day - 1));
    const y = yesterday.getUTCFullYear();
    const m = yesterday.getUTCMonth() + 1;
    const d = yesterday.getUTCDate();
    const iso = formatIsoDate(y, m, d);
    const label = `Kemarin (${formatReadableDateId(iso)})`;
    return {
      date_from: iso,
      date_to: iso,
      quarter: Math.ceil(m / 3),
      year: y,
      label,
      isDefaultAssumption: false,
      assumptionNote: `Periode: ${label}.`,
    };
  }

  if (/\bbulan\s+lalu\b/.test(lower)) {
    const m = wibNow.month === 1 ? 12 : wibNow.month - 1;
    const y = wibNow.month === 1 ? wibNow.year - 1 : wibNow.year;
    const date_from = formatIsoDate(y, m, 1);
    const date_to = formatIsoDate(y, m, lastDayOfMonth(y, m));
    const label = `Bulan lalu - ${MONTH_NAMES_ID[m]} ${y} (${formatReadableDateId(date_from)} s/d ${formatReadableDateId(date_to)})`;
    return {
      date_from,
      date_to,
      quarter: Math.ceil(m / 3),
      year: y,
      label,
      isDefaultAssumption: false,
      assumptionNote: `Periode: ${label}.`,
    };
  }

  if (/\bbulan\s+(ini|berjalan|sekarang)\b/.test(lower)) {
    const date_from = formatIsoDate(wibNow.year, wibNow.month, 1);
    const date_to = formatIsoDate(wibNow.year, wibNow.month, lastDayOfMonth(wibNow.year, wibNow.month));
    const label = `Bulan berjalan - ${MONTH_NAMES_ID[wibNow.month]} ${wibNow.year} (${formatReadableDateId(date_from)} s/d ${formatReadableDateId(date_to)})`;
    return {
      date_from,
      date_to,
      quarter: wibNow.quarter,
      year: wibNow.year,
      label,
      isDefaultAssumption: false,
      assumptionNote: `Periode: ${label}.`,
    };
  }

  if (/\btahun\s+lalu\b/.test(lower)) {
    const y = wibNow.year - 1;
    const date_from = `${y}-01-01`;
    const date_to = `${y}-12-31`;
    const label = `Tahun ${y} (1 Januari ${y} s/d 31 Desember ${y})`;
    return {
      date_from,
      date_to,
      quarter: 4,
      year: y,
      label,
      isDefaultAssumption: false,
      assumptionNote: `Periode: ${label}.`,
    };
  }

  if (/\btahun\s+(ini|berjalan|sekarang)\b/.test(lower) || /\b(?:tahun\s+)?(202\d)\b/.test(lower)) {
    const y = explicitYearMatch ? Number(explicitYearMatch[1]) : wibNow.year;
    const date_from = `${y}-01-01`;
    const date_to = `${y}-12-31`;
    const label = `Tahun ${y} (1 Januari ${y} s/d 31 Desember ${y})`;
    return {
      date_from,
      date_to,
      quarter: wibNow.quarter,
      year: y,
      label,
      isDefaultAssumption: false,
      assumptionNote: `Periode: ${label}.`,
    };
  }

  const defaultFrom = formatIsoDate(wibNow.year, wibNow.month, 1);
  const defaultTo = formatIsoDate(wibNow.year, wibNow.month, lastDayOfMonth(wibNow.year, wibNow.month));
  const defaultLabel = `${MONTH_NAMES_ID[wibNow.month]} ${wibNow.year} (${formatReadableDateId(defaultFrom)} s/d ${formatReadableDateId(defaultTo)})`;

  return {
    date_from: defaultFrom,
    date_to: defaultTo,
    quarter: wibNow.quarter,
    year: wibNow.year,
    label: defaultLabel,
    isDefaultAssumption: true,
    assumptionNote: `Periode tidak disebutkan secara spesifik oleh pengguna; menggunakan asumsi default bulan berjalan ${defaultLabel} (Q${wibNow.quarter} ${wibNow.year} WIB).`,
  };
}

export const AI_SKILL_DEFINITIONS: AiSkillCatalogDefinition[] = [
  {
    id: 'order_and_revenue_analytics',
    name: 'Analitik Order, Omzet & Toko',
    description: 'Rekap order, omzet transaksi, daerah terlaris, toko jasa instalasi, dan status order.',
    keywords: [
      'order',
      'pesanan',
      'transaksi',
      'omzet',
      'revenue',
      'daerah terlaris',
      'area terlaris',
      'wilayah',
      'toko jasa instalasi',
      'jasa instalasi',
      'rekap order',
    ],
    defaultReportKeys: ['reports_orders', 'orders', 'daerah_terlaris', 'toko_jasa_instalasi'],
  },
  {
    id: 'quotation_and_billing_report',
    name: 'Laporan Quotation, Invoice & Tagihan',
    description: 'Rekap penawaran (Quotation), SLA Quotation, status Invoice Paid/Unpaid, dan Pending Payment.',
    keywords: [
      'quotation',
      'penawaran',
      'rab',
      'invoice',
      'paid',
      'unpaid',
      'pending payment',
      'tagihan',
      'pembayaran',
      'billing',
      'quotein',
    ],
    defaultReportKeys: ['invoices_paid_unpaid', 'quotation_report'],
  },
  {
    id: 'work_order_and_schedule',
    name: 'Laporan Work Order, Reschedule & Remedial',
    description: 'Monitoring Work Order (SPK), pengajuan Reschedule, pengerjaan ulang (Remedial), dan Tukang.',
    keywords: [
      'work order',
      'wo',
      'spk',
      'jadwal kerja',
      'reschedule',
      'jadwal ulang',
      'remedial',
      'perbaikan ulang',
      'tukang',
      'bast',
    ],
    defaultReportKeys: ['work_orders', 'reschedule', 'remedials'],
  },
  {
    id: 'vendor_sp_and_performance',
    name: 'Evaluasi SP Vendor, Pelanggaran & Performa',
    description: 'Surat Peringatan (SP1/SP2/SP3), matriks SP Q1-Q4, log pelanggaran vendor, dan profil vendor.',
    keywords: [
      'sp',
      'surat peringatan',
      'sp1',
      'sp2',
      'sp3',
      'sp 1',
      'sp 2',
      'sp 3',
      'pelanggaran',
      'violation',
      'poin',
      'sanksi',
      'suspend',
      'vendor',
      'mitra vendor',
      'evaluasi vendor',
    ],
    defaultReportKeys: ['vendor_sp_list', 'vendor_sp_summary', 'vendor_sp_matrix', 'vendor_violations', 'vendor'],
  },
  {
    id: 'complaint_refund_and_warranty',
    name: 'Laporan Komplain, Refund, Garansi & CSI',
    description: 'Tiket komplain pelanggan, pengajuan refund, penalti vendor, klaim garansi, dan survei kepuasan (CSI).',
    keywords: [
      'komplain',
      'complaint',
      'keluhan',
      'refund',
      'pengembalian dana',
      'penalti',
      'garansi',
      'warranty',
      'csi',
      'kepuasan pelanggan',
    ],
    defaultReportKeys: ['complaints_report', 'refund_penalty_voucher', 'csi_report'],
  },
  {
    id: 'commission_and_incentive_report',
    name: 'Laporan Komisi Toko, Insentif Sales & Rekon',
    description: 'Perhitungan komisi sales, komisi toko, dan rekonsiliasi pencairan insentif.',
    keywords: [
      'komisi',
      'commission',
      'comission',
      'insentif',
      'incentive',
      'sales comission',
      'komisi sales',
      'komisi toko',
      'store comission',
      'rekon komisi',
    ],
    defaultReportKeys: ['sales_comission'],
  },
];

function sumNumericField(rows: Record<string, any>[], field: string): number {
  return rows.reduce((acc, r) => acc + (Number(r?.[field]) || 0), 0);
}

function countByField(rows: Record<string, any>[], field: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const val = String(r?.[field] ?? 'TIDAK_DIKETAHUI');
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

export const AI_REPORT_CATALOG: ReportCatalogItem[] = [
  {
    key: 'reports_orders',
    title: 'Rekap Laporan Order (reports/orders)',
    skill: 'order_and_revenue_analytics',
    status: 'ready',
    sumber: 'ReportsService.reportOrder',
    allowedParams: ['date_from', 'date_to', 'status', 'store_id', 'vendor_id'],
    fieldWhitelist: [
      'period',
      'totalOrder',
      'totalOrderGrandTotal',
      'totalOrderDone',
      'totalWaitingSurvey',
      'totalWaitingQuotation',
      'totalWaitingWork',
      'totalWorkStart',
      'totalComplaint',
      'totalCancel',
    ],
    maxRows: 35,
    keywords: ['rekap order', 'laporan order', 'reports/orders', 'omzet order', 'order bulanan', 'order'],
    summarize: (rawResult, rows) => ({
      totalOrdersInPeriod: Number(rawResult?.meta?.total ?? sumNumericField(rows, 'totalOrder')),
      orderGrandTotalServer: Number(rawResult?.meta?.orderGrandTotal ?? sumNumericField(rows, 'totalOrderGrandTotal')),
      quoteInGrandTotalServer: Number(rawResult?.meta?.quoteInGrandTotal ?? 0),
      totalOrderDoneBucketSum: sumNumericField(rows, 'totalOrderDone'),
      totalWaitingSurveyBucketSum: sumNumericField(rows, 'totalWaitingSurvey'),
      totalCancelBucketSum: sumNumericField(rows, 'totalCancel'),
    }),
  },
  {
    key: 'daerah_terlaris',
    title: 'Laporan Daerah / Area Terlaris (reports/daerah-terlaris)',
    skill: 'order_and_revenue_analytics',
    status: 'ready',
    sumber: 'ReportsService.daerahTerlarisReport',
    allowedParams: ['date_from', 'date_to', 'store_id'],
    fieldWhitelist: ['namaDaerah', 'jumlahPengajuan', 'totalNilaiTransaksi', 'nilaiJasa', 'nilaiMaterial'],
    maxRows: 25,
    keywords: ['daerah terlaris', 'area terlaris', 'wilayah terlaris', 'kota terlaris'],
    summarize: (_rawResult, rows) => ({
      totalAreas: rows.length,
      totalOrdersAcrossAreas: sumNumericField(rows, 'jumlahPengajuan'),
      totalRevenueAcrossAreas: sumNumericField(rows, 'totalNilaiTransaksi'),
      topArea: rows[0]?.namaDaerah || '-',
    }),
  },
  {
    key: 'toko_jasa_instalasi',
    title: 'Laporan Toko & Jasa Instalasi (reports/toko-jasa-instalasi)',
    skill: 'order_and_revenue_analytics',
    status: 'ready',
    sumber: 'ReportsService.tokoJasaInstalasiReport',
    allowedParams: ['date_from', 'date_to', 'store_id'],
    fieldWhitelist: [
      'namaToko',
      'jenisLayanan',
      'jumlahPengajuan',
      'totalNilaiTransaksi',
      'nilaiJasa',
      'nilaiMaterial',
    ],
    maxRows: 25,
    keywords: ['toko jasa instalasi', 'jasa instalasi', 'jasa terlaris', 'layanan instalasi', 'performa toko'],
    summarize: (_rawResult, rows) => ({
      totalRows: rows.length,
      totalOrders: sumNumericField(rows, 'jumlahPengajuan'),
      totalRevenue: sumNumericField(rows, 'totalNilaiTransaksi'),
    }),
  },
  {
    key: 'orders',
    title: 'Daftar Transaksi Order Operasional (orders)',
    skill: 'order_and_revenue_analytics',
    status: 'ready',
    sumber: 'OrderService.findAll',
    allowedParams: ['date_from', 'date_to', 'status', 'store_id', 'vendor_id'],
    fieldWhitelist: [
      'id',
      'order_code',
      'created_at',
      'customer_name',
      'store_name',
      'vendor_name',
      'status_code',
      'service_name',
      'grand_total',
    ],
    maxRows: 25,
    keywords: ['daftar order', 'list order', 'transaksi order', 'pesanan'],
    summarize: (rawResult, rows) => ({
      totalOrders: Number(rawResult?.meta?.total ?? rows.length),
      statusBreakdownSample: countByField(rows, 'status_code'),
      sampleGrandTotal: sumNumericField(rows, 'grand_total'),
    }),
  },
  {
    key: 'sales_comission',
    title: 'Laporan Komisi Sales (reports/sales-comission)',
    skill: 'commission_and_incentive_report',
    status: 'ready',
    sumber: 'ReportsService.salesComissionReport',
    allowedParams: ['date_from', 'date_to', 'store_id'],
    fieldWhitelist: [
      'id',
      'sales_name',
      'nik',
      'store_name',
      'order_code',
      'quotation_grand_total',
      'commission_amount',
      'created_at',
    ],
    maxRows: 30,
    keywords: ['sales comission', 'komisi sales', 'insentif sales', 'laporan sales'],
    summarize: (rawResult, rows) => ({
      totalRecords: Number(rawResult?.meta?.total ?? rows.length),
      totalCommissionSample: sumNumericField(rows, 'commission_amount'),
      totalQuotationSample: sumNumericField(rows, 'quotation_grand_total'),
    }),
  },
  {
    key: 'work_orders',
    title: 'Daftar Work Order / SPK (work-orders)',
    skill: 'work_order_and_schedule',
    status: 'ready',
    sumber: 'WorkOrdersService.findAll',
    allowedParams: ['date_from', 'date_to', 'status', 'store_id', 'vendor_id'],
    fieldWhitelist: [
      'id',
      'wo_code',
      'order_code',
      'vendor_name',
      'store_name',
      'status_code',
      'start_date',
      'end_date',
      'tukang_names',
      'created_at',
    ],
    maxRows: 30,
    keywords: ['work order', 'wo', 'spk', 'pengerjaan', 'jadwal tukang'],
    summarize: (rawResult, rows) => ({
      totalWorkOrders: Number(rawResult?.meta?.total ?? rows.length),
      statusBreakdownSample: countByField(rows, 'status_code'),
    }),
  },
  {
    key: 'reschedule',
    title: 'Daftar Pengajuan Reschedule Work Order (reschedule)',
    skill: 'work_order_and_schedule',
    status: 'ready',
    sumber: 'RescheduleService.findAll',
    allowedParams: ['date_from', 'date_to', 'status', 'vendor_id'],
    fieldWhitelist: [
      'id',
      'order_code',
      'vendor_name',
      'reason',
      'old_date',
      'new_date',
      'status_code',
      'created_at',
    ],
    maxRows: 25,
    keywords: ['reschedule', 'jadwal ulang', 'perubahan jadwal', 'ubah jadwal'],
    summarize: (rawResult, rows) => ({
      totalReschedules: Number(rawResult?.meta?.total ?? rows.length),
      statusBreakdownSample: countByField(rows, 'status_code'),
    }),
  },
  {
    key: 'remedials',
    title: 'Daftar Pengerjaan Ulang / Remedial (remedials)',
    skill: 'work_order_and_schedule',
    status: 'ready',
    sumber: 'RemedialsService.findAll',
    allowedParams: ['date_from', 'date_to', 'status', 'vendor_id'],
    fieldWhitelist: [
      'id',
      'remedial_code',
      'order_code',
      'vendor_name',
      'store_name',
      'reason',
      'status_code',
      'created_at',
    ],
    maxRows: 25,
    keywords: ['remedial', 'pengerjaan ulang', 'perbaikan ulang'],
    summarize: (rawResult, rows) => ({
      totalRemedials: Number(rawResult?.meta?.total ?? rows.length),
      statusBreakdownSample: countByField(rows, 'status_code'),
    }),
  },
  {
    key: 'vendor_sp_list',
    title: 'Daftar Surat Peringatan Vendor (vendor-sp)',
    skill: 'vendor_sp_and_performance',
    status: 'ready',
    sumber: 'VendorSpService.findAll',
    allowedParams: ['quarter', 'year', 'status', 'vendor_id'],
    fieldWhitelist: [
      'id',
      'sp_number',
      'vendor_id',
      'vendor_name',
      'sp_level',
      'quarter',
      'year',
      'total_point',
      'status',
      'issued_at',
      'appeal_status',
    ],
    maxRows: 40,
    keywords: ['sp vendor', 'surat peringatan', 'daftar sp', 'sp1', 'sp2', 'sp3', 'banding sp'],
    summarize: (rawResult, rows) => ({
      totalSpRecords: Number(rawResult?.meta?.total ?? rows.length),
      bySpLevel: countByField(rows, 'sp_level'),
      byStatus: countByField(rows, 'status'),
      byAppealStatus: countByField(rows, 'appeal_status'),
    }),
  },
  {
    key: 'vendor_sp_summary',
    title: 'Ringkasan Eksekutif SP Vendor per Kuartal (vendor-sp/summary)',
    skill: 'vendor_sp_and_performance',
    status: 'ready',
    sumber: 'VendorSpService.findAll + Prisma.vendor_sp',
    allowedParams: ['quarter', 'year', 'vendor_id'],
    fieldWhitelist: [
      'quarter',
      'year',
      'total_active_sp',
      'sp1_count',
      'sp2_count',
      'sp3_count',
      'suspended_vendor_count',
      'pending_appeal_count',
    ],
    maxRows: 5,
    keywords: ['ringkasan sp', 'summary sp', 'rekap sp', 'total sp', 'sp aktif'],
    summarize: (_rawResult, rows) => rows[0] || {},
  },
  {
    key: 'vendor_sp_matrix',
    title: 'Matriks Status SP & Poin Kuartalan Q1-Q4 Vendor (vendor-sp/matrix)',
    skill: 'vendor_sp_and_performance',
    status: 'ready',
    sumber: 'VendorService.findAll (Q1-Q4 & activeSp)',
    allowedParams: ['quarter', 'year', 'status', 'vendor_id'],
    fieldWhitelist: [
      'id',
      'company_name',
      'is_active',
      'active_sp_level',
      'q1_sp',
      'q2_sp',
      'q3_sp',
      'q4_sp',
      'quarter_violation_points',
      'total_orders',
    ],
    maxRows: 40,
    keywords: ['matriks sp', 'q1', 'q2', 'q3', 'q4', 'sp vendor', 'status sp vendor'],
    summarize: (_rawResult, rows) => ({
      totalVendorsEvaluated: rows.length,
      activeVendors: rows.filter((r) => r.is_active).length,
      vendorsWithActiveSp: rows.filter((r) => r.active_sp_level && r.active_sp_level !== '-').length,
      byActiveSpLevel: countByField(rows, 'active_sp_level'),
    }),
  },
  {
    key: 'vendor_violations',
    title: 'Log Pelanggaran & Poin Pinalti Vendor (vendor-violation/logs)',
    skill: 'vendor_sp_and_performance',
    status: 'ready',
    sumber: 'VendorViolationService.findAllViolationLogs',
    allowedParams: ['date_from', 'date_to', 'quarter', 'year', 'status', 'vendor_id'],
    fieldWhitelist: [
      'id',
      'vendor_id',
      'vendor_name',
      'order_code',
      'violation_code',
      'violation_name',
      'point',
      'quarter',
      'year',
      'status',
      'source',
      'detected_at',
    ],
    maxRows: 40,
    keywords: ['pelanggaran', 'violation', 'poin pelanggaran', 'log pelanggaran', 'pinalti poin'],
    summarize: (rawResult, rows) => ({
      totalViolationLogs: Number(rawResult?.meta?.total ?? rows.length),
      totalPointsSample: sumNumericField(rows, 'point'),
      byViolationCode: countByField(rows, 'violation_code'),
      byStatus: countByField(rows, 'status'),
    }),
  },
  {
    key: 'vendor',
    title: 'Daftar Master & Performa Vendor (vendor)',
    skill: 'vendor_sp_and_performance',
    status: 'ready',
    sumber: 'VendorService.findAll',
    allowedParams: ['quarter', 'year', 'status', 'vendor_id'],
    fieldWhitelist: [
      'id',
      'company_name',
      'pic_name',
      'phone_number',
      'is_active',
      'rating_avg',
      'active_sp_level',
      'quarter_violation_points',
      'orders_count',
      'paid_total',
      'unpaid_total',
    ],
    maxRows: 35,
    keywords: ['daftar vendor', 'profil vendor', 'performa vendor', 'rating vendor', 'vendor aktif'],
    summarize: (rawResult, rows) => ({
      totalVendors: Number(rawResult?.meta?.total ?? rows.length),
      activeVendorsSample: rows.filter((r) => r.is_active).length,
      inactiveVendorsSample: rows.filter((r) => !r.is_active).length,
    }),
  },
  {
    key: 'invoices_paid_unpaid',
    title: 'Laporan Invoice Paid, Unpaid & Pending Payment',
    skill: 'quotation_and_billing_report',
    status: 'ready',
    sumber: 'invoices (Database)',
    allowedParams: ['date_from', 'date_to', 'status', 'store_id', 'vendor_id'],
    fieldWhitelist: ['id', 'invoice_number', 'vendor_name', 'total_amount', 'status', 'created_at'],
    maxRows: 30,
    keywords: ['invoice', 'invoice paid', 'invoice unpaid', 'pending payment', 'tagihan', 'lunas', 'belum lunas'],
    summarize: (rawResult, rows) => {
      const totalAmount = rows.reduce((acc, r) => acc + Number(r.total_amount || 0), 0);
      return {
        totalInvoices: Number(rawResult?.meta?.total ?? rows.length),
        totalNominalTagihan: totalAmount,
        lunasSample: rows.filter((r) => String(r.status).toUpperCase() === 'PAID').length,
        pendingSample: rows.filter((r) => String(r.status).toUpperCase() !== 'PAID').length,
      };
    },
  },
  {
    key: 'quotation_report',
    title: 'Laporan Rekap Quotation & Penawaran Harga',
    skill: 'quotation_and_billing_report',
    status: 'ready',
    sumber: 'quotation (Database)',
    allowedParams: ['date_from', 'date_to', 'status', 'store_id', 'vendor_id'],
    fieldWhitelist: [
      'id',
      'quotation_number',
      'store_name',
      'customer_name',
      'quotation_grand_total',
      'status_code',
      'created_at',
    ],
    maxRows: 30,
    keywords: ['quotation', 'rekap quotation', 'penawaran harga', 'daily follow up', 'follow-up quotation', 'rab'],
    summarize: (rawResult, rows) => {
      const totalNominal = rows.reduce((acc, r) => acc + Number(r.quotation_grand_total || 0), 0);
      return {
        totalQuotations: Number(rawResult?.meta?.total ?? rows.length),
        totalNilaiQuotation: totalNominal,
        sampleHighest: rows[0]?.quotation_grand_total || 0,
      };
    },
  },
  {
    key: 'complaints_report',
    title: 'Laporan Komplain Pelanggan',
    skill: 'complaint_refund_and_warranty',
    status: 'ready',
    sumber: 'complaints (Database)',
    allowedParams: ['date_from', 'date_to', 'status', 'store_id', 'vendor_id'],
    fieldWhitelist: [
      'id',
      'complaint_code',
      'order_code',
      'customer_name',
      'pic_name',
      'type',
      'description',
      'created_at',
    ],
    maxRows: 30,
    keywords: ['komplain', 'complaint', 'keluhan pelanggan', 'tiket komplain', 'laporan komplain'],
    summarize: (rawResult, rows) => ({
      totalComplaints: Number(rawResult?.meta?.total ?? rows.length),
      sampleCount: rows.length,
    }),
  },
  {
    key: 'refund_penalty_voucher',
    title: 'Laporan Refund, Penalti Vendor & Voucher',
    skill: 'complaint_refund_and_warranty',
    status: 'ready',
    sumber: 'refund (Database)',
    allowedParams: ['date_from', 'date_to', 'status', 'store_id', 'vendor_id'],
    fieldWhitelist: ['id', 'order_code', 'reason', 'penalty_nominal', 'refund_status', 'created_at'],
    maxRows: 30,
    keywords: ['refund', 'pengembalian dana', 'penalti vendor', 'potongan vendor', 'voucher', 'klaim garansi'],
    summarize: (rawResult, rows) => {
      const totalPenalti = rows.reduce((acc, r) => acc + Number(r.penalty_nominal || 0), 0);
      return {
        totalRefunds: Number(rawResult?.meta?.total ?? rows.length),
        totalPenaltiNominal: totalPenalti,
      };
    },
  },
  {
    key: 'csi_report',
    title: 'Laporan Customer Satisfaction Index (CSI / Follow Up)',
    skill: 'complaint_refund_and_warranty',
    status: 'ready',
    sumber: 'order_follow_up (Database)',
    allowedParams: ['date_from', 'date_to', 'store_id', 'vendor_id'],
    fieldWhitelist: ['id', 'order_code', 'csi_survey', 'csi_work', 'is_done', 'created_at'],
    maxRows: 30,
    keywords: ['csi', 'customer satisfaction', 'kepuasan pelanggan', 'survei kepuasan', 'ulasan pelanggan'],
    summarize: (rawResult, rows) => ({
      totalFollowUp: Number(rawResult?.meta?.total ?? rows.length),
      doneSurveySample: rows.filter((r) => r.csi_survey).length,
      doneWorkSample: rows.filter((r) => r.csi_work).length,
    }),
  },
  {
    key: 'store_comission_report',
    title: 'Laporan Komisi Toko & Rekon Komisi',
    skill: 'commission_and_incentive_report',
    status: 'ready',
    sumber: 'sales (Database)',
    allowedParams: ['date_from', 'date_to', 'store_id'],
    fieldWhitelist: ['id', 'sales_name', 'store_name', 'order_total', 'created_at'],
    maxRows: 30,
    keywords: [
      'komisi toko',
      'store comission',
      'store commission',
      'rekon komisi',
      'pencairan komisi',
      'insentif toko',
    ],
    summarize: (rawResult, rows) => {
      const totalOrdersCount = rows.reduce((acc, r) => acc + Number(r.order_total || 0), 0);
      return {
        totalSales: Number(rawResult?.meta?.total ?? rows.length),
        totalOrdersManaged: totalOrdersCount,
      };
    },
  },
  {
    key: 'tukang_productivity',
    title: 'Laporan Produktivitas Tukang',
    skill: 'work_order_and_schedule',
    status: 'ready',
    sumber: 'tukang (Database)',
    allowedParams: ['date_from', 'date_to', 'vendor_id'],
    fieldWhitelist: ['id', 'tukang_name', 'vendor_name', 'phone_number', 'is_active', 'total_work_orders'],
    maxRows: 30,
    keywords: ['laporan tukang', 'produktivitas tukang', 'kinerja tukang', 'rekap tukang'],
    summarize: (rawResult, rows) => ({
      totalTukang: Number(rawResult?.meta?.total ?? rows.length),
      activeSample: rows.filter((r) => r.is_active).length,
    }),
  },
];

export function detectSkillAndReports(
  userPrompt: string,
  requestedSkillId?: string,
): {
  effectiveSkill: AiSkillCatalogDefinition;
  matchedReadyReports: ReportCatalogItem[];
  matchedUnavailableReports: ReportCatalogItem[];
} {
  const lower = String(userPrompt || '').toLowerCase();

  let effectiveSkill = AI_SKILL_DEFINITIONS.find((s) => s.id === requestedSkillId);
  if (!effectiveSkill) {
    let bestScore = -1;
    for (const skill of AI_SKILL_DEFINITIONS) {
      let score = 0;
      for (const kw of skill.keywords) {
        if (lower.includes(kw)) {
          score += kw.includes(' ') ? 3 : 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        effectiveSkill = skill;
      }
    }
    if (!effectiveSkill || bestScore <= 0) {
      effectiveSkill = AI_SKILL_DEFINITIONS[0];
    }
  }

  const matchedUnavailableReports = AI_REPORT_CATALOG.filter(
    (item) => item.status === 'unavailable' && item.keywords.some((kw) => lower.includes(kw)),
  );

  const skillReadyCatalog = AI_REPORT_CATALOG.filter(
    (item) => item.status === 'ready' && item.skill === effectiveSkill!.id,
  );

  let matchedReadyReports = skillReadyCatalog.filter((item) =>
    item.keywords.some((kw) => lower.includes(kw)),
  );

  if (matchedReadyReports.length === 0 && matchedUnavailableReports.length === 0) {
    matchedReadyReports = skillReadyCatalog.filter((item) =>
      effectiveSkill!.defaultReportKeys.includes(item.key),
    );
  }

  return {
    effectiveSkill,
    matchedReadyReports,
    matchedUnavailableReports,
  };
}
