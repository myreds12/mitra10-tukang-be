import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { dataCatalog } from './data-catalog';

@Injectable()
export class CatalogSearchService {
  constructor(private readonly db: PrismaService) {}
  async listItems(page: number, allowedFields: string[]) {
    const allowed = new Set(allowedFields);
    const fields = ['id', 'item_name', 'item_code', 'service_name', 'default_price', 'is_active'].filter(field => allowed.has(`db.items.${field}`));
    if (!fields.some(field => ['item_name', 'item_code', 'service_name'].includes(field))) {
      throw new ForbiddenException('Aktifkan setidaknya kolom items.item_name, items.item_code, atau items.service_name di Batasan & Privasi.');
    }
    const select = Object.fromEntries(fields.map(field => [field, true]));
    const rows = await this.db.items.findMany({ where: { deleted_at: null }, select, orderBy: { id: 'asc' }, skip: (page - 1) * 50, take: 51 });
    return { fields, data: rows.slice(0, 50), more: rows.length > 50 };
  }
  async orderItems(orderId: number, allowedFields: string[]) {
    const allowed = new Set(allowedFields);
    for (const field of ['order_id', 'item_name']) {
      if (!allowed.has(`db.m_order_details.${field}`)) throw new ForbiddenException(`Aktifkan kolom m_order_details.${field} di Batasan & Privasi untuk melihat item order.`);
    }
    const fields = ['item_name', 'item_code', 'quantity', 'unit_price', 'total'].filter(field => allowed.has(`db.m_order_details.${field}`));
    const select = Object.fromEntries(fields.map(field => [field, true]));
    const rows = await this.db.m_order_details.findMany({ where: { order_id: orderId, deleted_at: null }, select, orderBy: { id: 'asc' }, take: 51 });
    return { fields, data: rows.slice(0, 50), more: rows.length > 50 };
  }
  describe(input: any, allowedFields: string[]) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => k !== 'dataset')) throw new BadRequestException('Parameter katalog tidak valid.');
    if (input.dataset !== undefined && (typeof input.dataset !== 'string' || !Object.prototype.hasOwnProperty.call(dataCatalog, input.dataset))) throw new BadRequestException('Dataset tidak tersedia.');
    const selected = new Set(allowedFields);
    const datasets = Object.entries(dataCatalog).map(([name, fields]) => ({ dataset: name, fields: fields.filter(field => selected.has(`db.${name}.${field.name}`)).map(({name, type}) => ({name, type})) })).filter(item => item.fields.length && (!input.dataset || item.dataset === input.dataset));
    if (input.dataset) return { datasets };
    return { datasets: datasets.map(item => ({ dataset: item.dataset, jumlah_kolom: item.fields.length })), catatan: 'Panggil kembali dengan dataset untuk melihat kolom yang diizinkan.' };
  }
  async search(input: any, allowedFields: string[]) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['dataset','fields','filters','page','limit'].includes(k))) throw new BadRequestException('Parameter pencarian tidak valid.');
    const { dataset, fields, filters = [], page = 1, limit = 20 } = input;
    const catalog = typeof dataset === 'string' && Object.prototype.hasOwnProperty.call(dataCatalog, dataset) ? dataCatalog[dataset] : undefined;
    if (typeof dataset !== 'string' || !catalog || !Array.isArray(fields) || !fields.length || fields.length > 30 || new Set(fields).size !== fields.length) throw new BadRequestException('Dataset atau kolom pencarian tidak valid.');
    if (!Array.isArray(filters) || filters.length > 5 || !Number.isSafeInteger(page) || page < 1 || page > 100 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new BadRequestException('Filter atau halaman pencarian tidak valid.');
    const allowed = new Set(allowedFields);
    const checked = (name: any) => {
      const field = typeof name === 'string' && catalog.find(f => f.name === name);
      if (!field) throw new BadRequestException('Kolom pencarian tidak tersedia.');
      if (!allowed.has(`db.${dataset}.${name}`)) throw new ForbiddenException(`Kolom db.${dataset}.${name} belum diizinkan di Batasan & Privasi.`);
      return field;
    };
    const select: any = {};
    fields.forEach(field => { checked(field); select[field] = true; });
    const where: any = {};
    for (const filter of filters) {
      if (!filter || typeof filter !== 'object' || Array.isArray(filter) || Object.keys(filter).some(k => !['field','operator','value'].includes(k))) throw new BadRequestException('Filter tidak valid.');
      const field = checked(filter.field), op = filter.operator;
      if (!['equals','contains','gte','lte'].includes(op) || (op === 'contains' && field.type !== 'String')) throw new BadRequestException('Operator filter tidak didukung.');
      let value = filter.value;
      if (field.type === 'DateTime') { if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d(?:T.*)?$/.test(value) || Number.isNaN(Date.parse(value))) throw new BadRequestException('Tanggal filter tidak valid.'); value = new Date(value); }
      else if (field.type === 'Int' || field.type === 'Float' || field.type === 'Decimal' || field.type === 'BigInt') { if (typeof value !== 'number' || !Number.isFinite(value) || (field.type === 'Int' && !Number.isSafeInteger(value))) throw new BadRequestException('Angka filter tidak valid.'); }
      else if (field.type === 'Boolean') { if (typeof value !== 'boolean' || op !== 'equals') throw new BadRequestException('Nilai boolean filter tidak valid.'); }
      else if (field.type === 'String') { if (typeof value !== 'string' || !value.length || value.length > 200) throw new BadRequestException('Teks filter tidak valid.'); }
      else throw new BadRequestException('Tipe filter tidak didukung.');
      where[filter.field] = { ...(where[filter.field] || {}), [op]: value };
    }
    const id = catalog.find(field => field.isId);
    const delegate = (this.db as any)[dataset];
    if (!delegate || typeof delegate.findMany !== 'function' || !id) throw new BadRequestException('Dataset tidak mendukung pencarian.');
    const rows = await delegate.findMany({ where, select, orderBy: { [id.name]: 'asc' }, skip: (page - 1) * limit, take: limit + 1 });
    const data: any[] = []; let more = rows.length > limit;
    for (const row of rows.slice(0, limit)) {
      const safe = JSON.parse(JSON.stringify(row, (_key, value) => typeof value === 'bigint' ? value.toString() : value));
      if (Buffer.byteLength(JSON.stringify([...data, safe]), 'utf8') > 16000) throw new BadRequestException('Hasil terlalu besar; kurangi jumlah kolom atau jumlah baris per halaman.');
      data.push(safe);
    }
    return { dataset, data, jumlah_ditampilkan: data.length, halaman: page, masih_ada_data: more, catatan: more && data.length < limit ? 'Hasil terlalu besar; kurangi jumlah kolom atau persempit filter.' : 'Gunakan halaman berikutnya jika masih ada data.' };
  }
}
