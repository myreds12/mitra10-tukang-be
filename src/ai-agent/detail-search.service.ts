import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const DETAIL_TOOLS = ['search_orders', 'search_vendors'] as const;
const ORDER_FIELDS: Record<string, string> = {
  order_id: 'orders.order_id', tanggal_order: 'orders.tanggal_order',
  status: 'orders.status', store: 'orders.store', vendor: 'orders.vendor', kategori: 'orders.kategori',
  grand_total: 'orders.grand_total', additional_fee: 'orders.additional_fee', jml_item: 'orders.jml_item',
  tgl_mulai: 'orders.tgl_mulai', tgl_selesai: 'orders.tgl_selesai',
};
const VENDOR_FIELDS: Record<string, string> = { nama_vendor: 'orders.vendor', vendor_id: 'vendors.vendor_id', status_aktif: 'vendors.status_aktif' };
export const DETAIL_ORDER_FIELD_NAMES = Object.keys(ORDER_FIELDS);
export const DETAIL_VENDOR_FIELD_NAMES = Object.keys(VENDOR_FIELDS);

@Injectable()
export class DetailSearchService {
  constructor(private readonly db: PrismaService) {}

  private input(input: any, keys: string[]) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key))) throw new BadRequestException('Parameter pencarian tidak valid.');
  }
  private requireField(allowed: Set<string>, field: string) {
    if (!allowed.has(field)) throw new ForbiddenException(`Kolom ${field} belum diizinkan di Batasan & Privasi.`);
  }
  private text(value: any): string {
    if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 100) throw new BadRequestException('Filter teks harus berisi 1–100 karakter.');
    return value.trim();
  }
  private number(value: any, min: number, max: number): number {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new BadRequestException('Parameter angka pencarian tidak valid.');
    return value;
  }
  private date(value: any, end = false): Date {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Tanggal harus berformat YYYY-MM-DD.');
    const parsed = new Date(value + 'T00:00:00.000Z');
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException('Tanggal tidak valid.');
    if (end) parsed.setUTCDate(parsed.getUTCDate() + 1);
    return parsed;
  }
  private fields(input: any, mapping: Record<string, string>, allowed: Set<string>, mandatory: string[]): string[] {
    const selected = input.fields === undefined ? Object.keys(mapping).filter(key => allowed.has(mapping[key])) : input.fields;
    if (!Array.isArray(selected) || selected.length === 0 || selected.length > Object.keys(mapping).length || selected.some(key => typeof key !== 'string' || !mapping[key]) || new Set(selected).size !== selected.length) throw new BadRequestException('Daftar kolom pencarian tidak valid.');
    for (const name of [...selected, ...mandatory]) this.requireField(allowed, mapping[name]);
    return [...new Set([...mandatory, ...selected])];
  }

  async run(name: string, input: any, allowedFields: string[]) {
    const allowed = new Set(allowedFields);
    if (name === 'search_orders') return this.orders(input, allowed);
    if (name === 'search_vendors') return this.vendors(input, allowed);
    throw new BadRequestException('Tool pencarian tidak tersedia.');
  }

  private async orders(input: any, allowed: Set<string>) {
    this.input(input, ['from', 'to', 'order_id', 'status', 'store', 'vendor', 'category', 'after_order_id', 'limit', 'fields']);
    const selected = this.fields(input, ORDER_FIELDS, allowed, ['order_id']);
    const limit = input.limit === undefined ? 20 : this.number(input.limit, 1, 50);
    const where: Prisma.ordersWhereInput = { deleted_at: null };
    if (input.order_id !== undefined) { this.requireField(allowed, 'orders.order_id'); where.id = this.number(input.order_id, 1, 2147483647); }
    if (input.after_order_id !== undefined) {
      this.requireField(allowed, 'orders.order_id');
      if (input.order_id !== undefined) throw new BadRequestException('ID order dan kursor tidak dapat digunakan bersamaan.');
      where.id = { gt: this.number(input.after_order_id, 1, 2147483647) };
    }
    if (input.from !== undefined || input.to !== undefined) {
      for (const field of ['orders.tanggal_order', 'orders.bulan', 'orders.kuartal', 'orders.tahun']) this.requireField(allowed, field);
      const from = input.from === undefined ? undefined : this.date(input.from);
      const to = input.to === undefined ? undefined : this.date(input.to, true);
      if (from && to && from >= to) throw new BadRequestException('Rentang tanggal tidak valid.');
      where.created_at = { gte: from, lt: to };
    }
    if (input.status !== undefined) { this.requireField(allowed, 'orders.status'); where.status = { is: { description: { contains: this.text(input.status) } } }; }
    if (input.store !== undefined) { this.requireField(allowed, 'orders.store'); where.store = { is: { store_name: { contains: this.text(input.store) } } }; }
    if (input.vendor !== undefined) { this.requireField(allowed, 'orders.vendor'); where.vendor = { is: { company_name: { contains: this.text(input.vendor) } } }; }
    if (input.category !== undefined) { this.requireField(allowed, 'orders.kategori'); where.m_order_details = { some: { deleted_at: null, item: { is: { category: { category_name: { contains: this.text(input.category) } } } } } }; }
    const select: Prisma.ordersSelect = { id: true };
    if (selected.includes('tanggal_order')) select.created_at = true;
    if (selected.includes('status')) select.status = { select: { description: true } };
    if (selected.includes('store')) select.store = { select: { store_name: true } };
    if (selected.includes('vendor')) select.vendor = { select: { company_name: true } };
    if (selected.includes('grand_total')) select.grand_total = true;
    if (selected.includes('additional_fee')) select.additional_fee = true;
    if (selected.includes('kategori') || selected.includes('jml_item')) {
      select.m_order_details = {
        where: { deleted_at: null }, take: 51, orderBy: { id: 'asc' },
        select: {
          ...(selected.includes('jml_item') ? { quantity: true } : {}),
          ...(selected.includes('kategori') ? { item: { select: { category: { select: { category_name: true } } } } } : {}),
        },
      };
    }
    if (selected.includes('tgl_mulai') || selected.includes('tgl_selesai')) select.work_orders = { select: { deleted_at: true, ...(selected.includes('tgl_mulai') ? { work_start_date: true } : {}), ...(selected.includes('tgl_selesai') ? { work_end_date: true } : {}) } };
    const rows: any[] = await this.db.orders.findMany({ where, select, orderBy: { id: 'asc' }, take: limit + 1 });
    let hasMore = rows.length > limit;
    const data: any[] = [];
    for (const row of rows.slice(0, limit)) {
      const out: any = { order_id: row.id };
      if (selected.includes('tanggal_order')) out.tanggal_order = row.created_at;
      if (selected.includes('status')) out.status = row.status?.description || null;
      if (selected.includes('store')) out.store = row.store?.store_name || null;
      if (selected.includes('vendor')) out.vendor = row.vendor?.company_name || null;
      if (selected.includes('grand_total')) out.grand_total = row.grand_total === null ? null : Number(row.grand_total);
      if (selected.includes('additional_fee')) out.additional_fee = row.additional_fee === null ? null : Number(row.additional_fee);
      if (selected.includes('kategori') || selected.includes('jml_item')) {
        const details = row.m_order_details.slice(0, 50);
        if (selected.includes('kategori')) out.kategori = [...new Set(details.map((x: any) => x.item?.category?.category_name).filter(Boolean))];
        if (selected.includes('jml_item')) out.jml_item = row.m_order_details.length > 50 ? null : details.reduce((sum: number, x: any) => sum + x.quantity, 0);
        if (row.m_order_details.length > 50) out.detail_item_terpotong = true;
      }
      if (selected.includes('tgl_mulai')) out.tgl_mulai = row.work_orders?.deleted_at ? null : row.work_orders?.work_start_date || null;
      if (selected.includes('tgl_selesai')) out.tgl_selesai = row.work_orders?.deleted_at ? null : row.work_orders?.work_end_date || null;
      if (Buffer.byteLength(JSON.stringify([...data, out]), 'utf8') > 16000) { hasMore = true; break; }
      data.push(out);
    }
    return { data, jumlah_ditampilkan: data.length, masih_ada_data: hasMore, ...(hasMore && data.length ? { after_order_id_berikutnya: data[data.length - 1].order_id } : {}), catatan: 'Hasil dibatasi; gunakan kursor untuk halaman berikutnya. Tanggal filter berdasarkan tanggal pembuatan order. Nama vendor dapat berupa nama perorangan.' };
  }

  private async vendors(input: any, allowed: Set<string>) {
    this.input(input, ['vendor', 'status_aktif', 'page', 'limit', 'fields']);
    const selected = this.fields(input, VENDOR_FIELDS, allowed, ['nama_vendor']);
    const limit = input.limit === undefined ? 20 : this.number(input.limit, 1, 50);
    const page = input.page === undefined ? 1 : this.number(input.page, 1, 100);
    const where: Prisma.vendorWhereInput = { deleted_at: null };
    if (input.vendor !== undefined) { this.requireField(allowed, 'orders.vendor'); where.company_name = { contains: this.text(input.vendor) }; }
    if (input.status_aktif !== undefined) { this.requireField(allowed, 'vendors.status_aktif'); if (typeof input.status_aktif !== 'boolean') throw new BadRequestException('Status aktif harus true atau false.'); where.is_active = input.status_aktif; }
    const select: Prisma.vendorSelect = { company_name: true };
    if (selected.includes('vendor_id')) select.id = true;
    if (selected.includes('status_aktif')) select.is_active = true;
    const rows: any[] = await this.db.vendor.findMany({ where, select, orderBy: [{ company_name: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit + 1 });
    return { data: rows.slice(0, limit).map(row => ({ nama_vendor: row.company_name, ...(selected.includes('vendor_id') ? { vendor_id: row.id } : {}), ...(selected.includes('status_aktif') ? { status_aktif: row.is_active } : {}) })), jumlah_ditampilkan: Math.min(rows.length, limit), halaman: page, masih_ada_data: rows.length > limit, ...(rows.length > limit && page < 100 ? { halaman_berikutnya: page + 1 } : {}), catatan: 'Nama vendor dapat berupa nama perorangan. Maksimal 100 halaman; jika hasil masih terpotong, persempit filter nama.' };
  }
}
