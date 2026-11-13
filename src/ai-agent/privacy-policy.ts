import { datasets } from './privacy-fields';

export const PRIVACY_FIELDS: string[] = Object.entries(datasets).flatMap(([dataset, value]: [string, any]) => Object.keys(value.fields).map(field => `${dataset}.${field}`));
// A tool is enabled only when every field it uses is allowed. Other tools are
// unavailable until all of their inputs have an explicit policy mapping.
export const TOOL_FIELD_REQUIREMENTS: Record<string, string[]> = {
  get_transaction_summary: ['orders.tanggal_order', 'orders.bulan', 'orders.kuartal', 'orders.tahun', 'orders.status', 'orders.status_grup', 'orders.grand_total'],
  get_complaint_summary: ['complaints.tanggal', 'complaints.bulan', 'complaints.tahun', 'complaints.kanal'],
  get_work_order_summary: ['orders.tanggal_order', 'orders.bulan', 'orders.kuartal', 'orders.tahun', 'orders.tgl_mulai', 'orders.tgl_selesai', 'orders.durasi_kerja_hari'],
};
export function permittedTools(fields: string[]): string[] {
  const selected = new Set(fields);
  return Object.entries(TOOL_FIELD_REQUIREMENTS).filter(([, required]) => required.every(field => selected.has(field))).map(([name]) => name);
}
