import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { dataCatalog } from './data-catalog';

const ROW_LIMIT = 50;
const CELL_LIMIT = 4000;
type Section = { dataset: string; title: string; fields: string[]; data: Record<string, any>[]; more: boolean };
export type OrderDetail = { sections: Section[]; limitations: string[] };

// Only route a single, explicit, unconstrained read. Requests with exclusions or
// comparisons still need the model to interpret the user's narrower intent.
export function resolveFullOrderIntent(question: string): number | null {
  if (!/\b(?:lengkap|selengkapnya|keseluruhan|seluruh|semua\s+(?:data|detail|kolom)|full\s+(?:data|detail))\b/i.test(question)) return null;
  if (/\b(?:hapus|ubah|edit|tambah|update|delete|bandingkan|banding|kecuali|tanpa|hanya|jangan|bukan|terakhir|terbaru|pertama|sebelum|sesudah)\b/i.test(question)) return null;
  const match = question.match(/\b(?:order\s*(?:id\s*)?|id\s*order\s*)[:#]?\s*(\d+)\b/i);
  if (!match || (question.match(/\d+/g) || []).length !== 1) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

@Injectable()
export class OrderDetailService {
  constructor(private readonly db: PrismaService) {}

  async read(orderId: number, allowedFields: string[]): Promise<OrderDetail> {
    if (!Number.isSafeInteger(orderId) || orderId < 1 || orderId > 2147483647) throw new BadRequestException('ID order tidak valid.');
    const allowed = new Set(allowedFields);
    if (!allowed.has('db.orders.id')) throw new ForbiddenException('Untuk data order lengkap, aktifkan kolom id dan kolom yang dibutuhkan pada tabel orders di bagian Kolom database untuk pencarian detail, Batasan & Privasi.');
    const sections: Section[] = [];
    const limitations: string[] = [];
    const fieldsFor = (dataset: string) => (dataCatalog[dataset] || []).filter(field => allowed.has(`db.${dataset}.${field.name}`)).map(field => field.name);
    const load = async (dataset: string, title: string, filterField: string, ids: number[]) => {
      const fields = fieldsFor(dataset);
      if (!fields.length || !allowed.has(`db.${dataset}.${filterField}`)) {
        limitations.push(`${title} (${dataset}): kolom data atau kolom penghubung ${filterField} belum diizinkan.`);
        return undefined;
      }
      const validIds = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
      const where: any = { [filterField]: { in: validIds } };
      if (dataCatalog[dataset].some(field => field.name === 'deleted_at')) where.deleted_at = null;
      const idField = dataCatalog[dataset].find(field => field.isId);
      const rows = validIds.length ? await (this.db as any)[dataset].findMany({
        where, select: Object.fromEntries(fields.map(field => [field, true])),
        orderBy: { [idField.name]: 'asc' }, take: ROW_LIMIT + 1,
      }) : [];
      const section: Section = { dataset, title, fields, data: rows.slice(0, ROW_LIMIT), more: rows.length > ROW_LIMIT };
      sections.push(section);
      return section;
    };
    const root = await load('orders', 'Order', 'id', [orderId]);
    if (!root.data.length) return { sections, limitations: [] };
    const order = root.data[0];
    // Every join key is itself explicitly allowed; never select a hidden key
    // merely to reach a related dataset.
    for (const [key, dataset, title] of [
      ['project_status_id', 'status', 'Status order'], ['store_id', 'store', 'Toko'],
      ['vendor_id', 'vendor', 'Vendor'], ['member_id', 'members', 'Customer'], ['sales_id', 'sales', 'Sales'],
    ]) {
      if (!allowed.has(`db.orders.${key}`)) limitations.push(`${title} (${dataset}): kolom penghubung orders.${key} belum diizinkan.`);
      else await load(dataset, title, 'id', order[key] == null ? [] : [order[key]]);
    }
    for (const [dataset, title] of [
      ['m_order_details', 'Item order'], ['work_orders', 'Perintah kerja'], ['quotation', 'Quotation'],
      ['complaints', 'Pengaduan'], ['refund', 'Refund'], ['reschedule', 'Penjadwalan ulang'],
      ['invoice_details', 'Rincian invoice'], ['order_files', 'Berkas order'],
      ['order_histories', 'Riwayat status order'], ['order_follow_up', 'Tindak lanjut order'],
    ]) await load(dataset, title, 'order_id', [orderId]);
    for (const [source, key, dataset, title] of [
      ['m_order_details', 'item_id', 'items', 'Master item'],
      ['invoice_details', 'invoice_id', 'invoices', 'Invoice vendor'],
    ]) {
      const section = sections.find(section => section.dataset === source);
      if (!section) continue;
      if (!allowed.has(`db.${source}.${key}`)) limitations.push(`${title} (${dataset}): kolom penghubung ${source}.${key} belum diizinkan.`);
      else {
        await load(dataset, title, 'id', section.data.map(row => row[key]));
        if (section.more) limitations.push(`${title}: hanya terkait ${ROW_LIMIT} baris ${source} yang ditampilkan.`);
      }
    }
    return { sections, limitations };
  }
}

export function formatOrderDetail(orderId: number, result: OrderDetail): string {
  const root = result.sections.find(section => section.dataset === 'orders');
  if (!root?.data.length) return `Order ID ${orderId} tidak ditemukan atau sudah dihapus.`;
  const labels: Record<string, string> = {
    id: 'ID', created_at: 'Tanggal dibuat', updated_at: 'Terakhir diubah', deleted_at: 'Tanggal dihapus',
    request_survey: 'Tanggal request survey', request_work: 'Tanggal request kerja', payment_type: 'Tipe pembayaran',
    grand_total: 'Grand total', additional_fee: 'Biaya tambahan', grand_total_comission: 'Komisi grand total',
    receipt_number: 'Nomor receipt', project_number: 'Nomor kontak proyek', project_address: 'Alamat proyek',
    notes: 'Catatan', item_name: 'Nama item', quantity: 'Jumlah', unit_price: 'Harga satuan', total: 'Total',
    work_start_date: 'Tanggal mulai pekerjaan', work_end_date: 'Tanggal selesai pekerjaan', description: 'Deskripsi',
  };
  let clipped = false;
  const cell = (value: any) => {
    let text = value == null ? '— (belum diisi)' : value instanceof Date ? value.toISOString() : typeof value === 'object' && typeof value.toJSON === 'function' ? String(value.toJSON()) : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (text.length > CELL_LIMIT) { text = text.slice(0, CELL_LIMIT) + ' [teks dipotong]'; clipped = true; }
    return text.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  };
  const lines = [`Data lengkap untuk **Order ID ${orderId}** sesuai kolom yang diizinkan.`, '',
    `Seluruh **${root.fields.length} kolom** tabel orders yang diizinkan ditampilkan, beserta data terkait yang dapat dibaca.`,
    '', 'Tanggal ditampilkan dalam UTC. Nilai kosong berarti belum diisi; tanggal kosong tidak cukup untuk menyimpulkan pekerjaan belum dimulai.'];
  for (const section of result.sections) {
    lines.push('', `## ${section.title} (${section.dataset})`);
    if (!section.data.length) { lines.push('', 'Tidak ada data aktif terkait.'); continue; }
    section.data.forEach((row, index) => {
      if (section.data.length > 1) lines.push('', `### Baris ${index + 1}`);
      lines.push('', '| Kolom | Nilai |', '|---|---|');
      for (const field of section.fields) lines.push(`| ${labels[field] ? `${labels[field]} (${field})` : field} | ${cell(row[field])} |`);
    });
    if (section.more) lines.push('', `Hasil ${section.dataset} dibatasi ${ROW_LIMIT} baris; masih ada data yang belum ditampilkan.`);
  }
  lines.push('', '## Cakupan data', '', 'Mencakup kolom order, relasi langsung order, master item dan invoice vendor yang diizinkan. Baris yang sudah dihapus tidak disertakan. Isi berkas tidak dibaca. CSI belum disertakan karena belum ada relasi langsung yang terverifikasi ke ID order.');
  if (result.limitations.length) lines.push('', 'Bagian yang belum dapat dibaca karena izin kolom:', ...result.limitations.map(note => `- ${note}`));
  if (clipped) lines.push('', `Teks di atas ${CELL_LIMIT} karakter dipotong dan ditandai; isi panjang belum ditampilkan seluruhnya.`);
  return lines.join('\n');
}
