import { datasets } from './privacy-fields';

export const PRIVACY_FIELDS: string[] = Object.entries(datasets).flatMap(([dataset, value]: [string, any]) => Object.keys(value.fields).map(field => `${dataset}.${field}`));
// A tool is enabled only when every field it uses is allowed. Other tools are
// unavailable until all of their inputs have an explicit policy mapping.
export const TOOL_FIELD_REQUIREMENTS: Record<string, string[]> = {
  get_transaction_summary: ['orders.tanggal_order', 'orders.bulan', 'orders.kuartal', 'orders.tahun', 'orders.status', 'orders.status_grup', 'orders.grand_total'],
  get_top_order_categories: ['orders.order_id', 'orders.tanggal_order', 'orders.bulan', 'orders.kuartal', 'orders.tahun', 'orders.kategori', 'orders.jml_item'],
  get_csi_summary: ['csi.tanggal', 'csi.bulan', 'csi.tahun', 'csi.jumlah_jawaban'],
  get_csi_template_breakdown: ['csi.tanggal', 'csi.bulan', 'csi.tahun', 'csi.jumlah_jawaban', 'csi.template'],
  get_order_status_breakdown: ['orders.tanggal_order', 'orders.bulan', 'orders.kuartal', 'orders.tahun', 'orders.status'],
  get_order_store_breakdown: ['orders.tanggal_order', 'orders.bulan', 'orders.kuartal', 'orders.tahun', 'orders.store'],
  get_invoice_summary: ['invoices.tanggal', 'invoices.bulan', 'invoices.kuartal', 'invoices.tahun', 'invoices.total_amount'],
  get_invoice_status_breakdown: ['invoices.tanggal', 'invoices.bulan', 'invoices.kuartal', 'invoices.tahun', 'invoices.status'],
  get_complaint_status_breakdown: ['complaints.tanggal', 'complaints.bulan', 'complaints.tahun', 'complaints.status'],
  get_complaint_category_breakdown: ['complaints.tanggal', 'complaints.bulan', 'complaints.tahun', 'complaints.order_id', 'complaints.kategori'],
  get_work_duration_by_category: ['orders.order_id', 'orders.tanggal_order', 'orders.bulan', 'orders.kuartal', 'orders.tahun', 'orders.kategori', 'orders.tgl_mulai', 'orders.tgl_selesai', 'orders.durasi_kerja_hari'],
  get_work_start_patterns: ['orders.tanggal_order', 'orders.bulan', 'orders.kuartal', 'orders.tahun', 'orders.tgl_mulai'],
  get_top_order_vendors: ['orders.tanggal_order', 'orders.bulan', 'orders.kuartal', 'orders.tahun', 'orders.vendor'],
  get_complaint_summary: ['complaints.tanggal', 'complaints.bulan', 'complaints.tahun', 'complaints.kanal'],
  get_work_order_summary: ['orders.tanggal_order', 'orders.bulan', 'orders.kuartal', 'orders.tahun', 'orders.tgl_mulai', 'orders.tgl_selesai', 'orders.durasi_kerja_hari'],
};
export function permittedTools(fields: string[]): string[] {
  const selected = new Set(fields);
  return Object.entries(TOOL_FIELD_REQUIREMENTS).filter(([, required]) => required.every(field => selected.has(field))).map(([name]) => name);
}
