import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const TOOL_NAMES = ['get_transaction_summary', 'get_top_order_categories', 'get_order_status_breakdown', 'get_order_store_breakdown', 'get_invoice_summary', 'get_invoice_status_breakdown', 'get_complaint_status_breakdown', 'get_complaint_category_breakdown', 'get_work_duration_by_category', 'get_work_start_patterns', 'get_top_order_vendors', 'get_csi_template_breakdown', 'get_work_order_summary', 'get_work_patterns', 'get_complaint_summary', 'get_vendor_summary', 'get_csi_summary'] as const;

@Injectable()
export class DataAggregatorService {
  constructor(private readonly db: PrismaService) {}

  private period(input: any = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Periode tidak valid');
    const parse = (value: any, end: boolean) => {
      if (value === undefined) return undefined;
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Tanggal harus berformat YYYY-MM-DD');
      const date = new Date(value + 'T00:00:00.000Z');
      if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Tanggal tidak valid');
      if (end) date.setUTCDate(date.getUTCDate() + 1);
      return date;
    };
    const from = parse(input.from, false), to = parse(input.to, true);
    if (from && to && from >= to) throw new BadRequestException('Rentang tanggal tidak valid');
    return { gte: from, lt: to };
  }

  async dashboard(input: any = {}) {
    const created_at = this.period(input);
    const where = { deleted_at: null, created_at };
    const [summary, invoice, complaints, months, statusGroups, storeGroups] = await Promise.all([
      this.run('get_transaction_summary', input),
      this.db.invoices.aggregate({ where, _count: { _all: true }, _sum: { total_amount: true } }),
      this.db.complaints.count({ where }),
      this.db.orders.groupBy({ by: ['created_at'], where, _count: { _all: true } }),
      this.db.orders.groupBy({ by: ['project_status_id'], where, _count: { _all: true } }),
      this.db.orders.groupBy({ by: ['store_id'], where, _sum: { grand_total: true }, orderBy: { _sum: { grand_total: 'desc' } }, take: 10 }),
    ]);
    const [statuses, stores] = await Promise.all([
      this.db.status.findMany({ where: { id: { in: statusGroups.map(x => x.project_status_id) } }, select: { id: true, description: true } }),
      this.db.store.findMany({ where: { id: { in: storeGroups.map(x => x.store_id) } }, select: { id: true, store_name: true } }),
    ]);
    const monthly: Record<string, number> = {};
    months.forEach(x => { const month = x.created_at.toISOString().slice(0, 7); monthly[month] = (monthly[month] || 0) + x._count._all; });
    return { ...summary, invoice_count: invoice._count._all, invoice_total: Number(invoice._sum.total_amount || 0), complaint_count: complaints,
      monthly: Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })),
      statuses: statusGroups.map(x => ({ label: statuses.find(s => s.id === x.project_status_id)?.description || `Status ${x.project_status_id}`, count: x._count._all })),
      stores: storeGroups.map(x => ({ label: stores.find(s => s.id === x.store_id)?.store_name || `Toko ${x.store_id}`, total: Number(x._sum.grand_total || 0) })),
    };
  }

  async run(name: string, input: any = {}) {
    if (!TOOL_NAMES.includes(name as any)) throw new BadRequestException('Tool tidak tersedia');
    const created_at = this.period(input);
    const filter = { deleted_at: null, created_at };
    switch (name) {
      case 'get_transaction_summary': {
        const [agg, statuses] = await Promise.all([
          this.db.orders.aggregate({ where: filter, _count: { _all: true }, _sum: { grand_total: true }, _avg: { grand_total: true } }),
          this.db.orders.groupBy({ by: ['project_status_id'], where: filter, _count: { _all: true } }),
        ]);
        const ids = (key: string) => (process.env[key] || '').split(',').map(x => x.trim()).filter(x => /^\d+$/.test(x)).map(Number);
        const confirmed = process.env.AI_AGENT_STATUS_IDS_CONFIRMED === 'true';
        const completed = confirmed ? ids('AI_AGENT_COMPLETED_STATUS_IDS') : [], cancelled = confirmed ? ids('AI_AGENT_CANCELLED_STATUS_IDS') : [];
        const count = (values: number[]) => statuses.filter(s => values.includes(s.project_status_id)).reduce((n, s) => n + s._count._all, 0);
        return { total_order: agg._count._all, selesai: completed.length ? count(completed) : null, batal: cancelled.length ? count(cancelled) : null, nilai_total_order: Number(agg._sum.grand_total || 0), rata_rata_nilai_order: agg._avg.grand_total === null ? null : Number(agg._avg.grand_total), catatan: 'Nilai termasuk semua status; selesai/batal null sampai ID status dikonfirmasi dan dikonfigurasi. Periode berdasarkan tanggal pembuatan order.' };
      }
      case 'get_order_status_breakdown': {
        const groups = await this.db.orders.groupBy({ by: ['project_status_id'], where: filter, _count: { _all: true } });
        const statuses = await this.db.status.findMany({ where: { id: { in: groups.map(x => x.project_status_id) } }, select: { id: true, description: true } });
        return { berdasarkan_status: groups.map(x => ({ status: statuses.find(s => s.id === x.project_status_id)?.description || `Status ${x.project_status_id}`, jumlah_order: x._count._all })).sort((a, b) => b.jumlah_order - a.jumlah_order), catatan: 'Periode berdasarkan tanggal pembuatan order; status adalah status terakhir.' };
      }
      case 'get_order_store_breakdown': {
        const groups = await this.db.orders.groupBy({ by: ['store_id'], where: filter, _count: { _all: true }, orderBy: { _count: { store_id: 'desc' } }, take: 10 });
        const stores = await this.db.store.findMany({ where: { id: { in: groups.map(x => x.store_id) } }, select: { id: true, store_name: true } });
        return { peringkat_toko: groups.map(x => ({ toko: stores.find(s => s.id === x.store_id)?.store_name || `Toko ${x.store_id}`, jumlah_order: x._count._all })), catatan: 'Sepuluh toko menurut jumlah order; semua status berdasarkan tanggal pembuatan order.' };
      }
      case 'get_invoice_summary': {
        const result = await this.db.invoices.aggregate({ where: filter, _count: { _all: true }, _sum: { total_amount: true }, _avg: { total_amount: true } });
        return { jumlah_invoice: result._count._all, total_nilai: Number(result._sum.total_amount || 0), rata_rata_nilai: result._avg.total_amount === null ? null : Number(result._avg.total_amount), catatan: 'Termasuk seluruh status invoice; periode berdasarkan tanggal pembuatan invoice.' };
      }
      case 'get_invoice_status_breakdown': {
        const groups = await this.db.invoices.groupBy({ by: ['status'], where: filter, _count: { _all: true } });
        return { berdasarkan_status: groups.map(x => ({ kode_status: x.status, jumlah_invoice: x._count._all })).sort((a, b) => b.jumlah_invoice - a.jumlah_invoice), catatan: 'Status menggunakan kode database; periode berdasarkan tanggal pembuatan invoice.' };
      }
      case 'get_complaint_status_breakdown': {
        const groups = await this.db.complaints.groupBy({ by: ['complaint_status'], where: filter, _count: { _all: true } });
        const ids = groups.map(x => x.complaint_status).filter(id => id !== null);
        const statuses = await this.db.status.findMany({ where: { id: { in: ids } }, select: { id: true, description: true } });
        return { berdasarkan_status: groups.map(x => ({ status: x.complaint_status === null ? 'Tidak tersedia' : statuses.find(s => s.id === x.complaint_status)?.description || `Status ${x.complaint_status}`, jumlah_pengaduan: x._count._all })).sort((a, b) => b.jumlah_pengaduan - a.jumlah_pengaduan), catatan: 'Periode berdasarkan tanggal pembuatan pengaduan; status adalah status terakhir.' };
      }
      case 'get_complaint_category_breakdown': {
        const complaintOrders = await this.db.complaints.groupBy({ by: ['order_id'], where: filter, _count: { _all: true }, orderBy: { order_id: 'asc' }, take: 50001 });
        if (complaintOrders.length > 50000) throw new BadRequestException('Data terlalu banyak; gunakan periode yang lebih pendek.');
        const counts = new Map(complaintOrders.map(x => [x.order_id, x._count._all]));
        const details = [];
        for (let offset = 0; offset < complaintOrders.length; offset += 1000) {
          details.push(...await this.db.m_order_details.findMany({ where: { deleted_at: null, order_id: { in: complaintOrders.slice(offset, offset + 1000).map(x => x.order_id) }, item_id: { not: null } }, select: { order_id: true, item: { select: { category: { select: { id: true, category_name: true } } } } }, take: 50001 - details.length }));
          if (details.length > 50000) throw new BadRequestException('Data terlalu banyak; gunakan periode yang lebih pendek.');
        }
        const pairs = new Set<string>();
        const matchedOrders = new Set<number>();
        const categories = new Map<number, { kategori: string; jumlah_pengaduan: number }>();
        for (const detail of details) {
          const category = detail.item?.category;
          if (!category) continue;
          const pair = `${detail.order_id}:${category.id}`;
          if (pairs.has(pair)) continue;
          pairs.add(pair);
          matchedOrders.add(detail.order_id);
          if (!categories.has(category.id)) categories.set(category.id, { kategori: category.category_name, jumlah_pengaduan: 0 });
          categories.get(category.id).jumlah_pengaduan += counts.get(detail.order_id) || 0;
        }
        return { berdasarkan_kategori: [...categories.values()].sort((a, b) => b.jumlah_pengaduan - a.jumlah_pengaduan || a.kategori.localeCompare(b.kategori)).slice(0, 10), total_pengaduan: complaintOrders.reduce((sum, x) => sum + x._count._all, 0), pengaduan_tanpa_kategori: complaintOrders.filter(x => !matchedOrders.has(x.order_id)).reduce((sum, x) => sum + x._count._all, 0), catatan: 'Kategori berasal dari item pada order terkait, bukan kategori penyebab pengaduan. Satu pengaduan bisa masuk beberapa kategori; pengaduan tanpa item berkategori tidak masuk peringkat. Periode berdasarkan tanggal pembuatan pengaduan.' };
      }
      case 'get_work_duration_by_category': {
        const work = await this.db.work_orders.findMany({ where: { ...filter, work_start_date: { not: null }, work_end_date: { not: null } }, select: { order_id: true, work_start_date: true, work_end_date: true }, take: 20001, orderBy: { id: 'asc' } });
        if (work.length > 20000) throw new BadRequestException('Data terlalu banyak; gunakan periode yang lebih pendek.');
        const valid = work.map(x => ({ order_id: x.order_id, hours: (x.work_end_date.getTime() - x.work_start_date.getTime()) / 3600000 })).filter(x => x.hours >= 0);
        const hoursByOrder = new Map(valid.map(x => [x.order_id, x.hours]));
        const details = [];
        for (let offset = 0; offset < valid.length; offset += 1000) {
          details.push(...await this.db.m_order_details.findMany({ where: { deleted_at: null, order_id: { in: valid.slice(offset, offset + 1000).map(x => x.order_id) }, item_id: { not: null } }, select: { order_id: true, item: { select: { category: { select: { id: true, category_name: true } } } } }, take: 50001 - details.length }));
          if (details.length > 50000) throw new BadRequestException('Data terlalu banyak; gunakan periode yang lebih pendek.');
        }
        const seen = new Set<string>();
        const categories = new Map<number, { kategori: string; jumlah_work_order: number; total_jam: number }>();
        for (const detail of details) {
          const category = detail.item?.category;
          if (!category) continue;
          const key = `${detail.order_id}:${category.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (!categories.has(category.id)) categories.set(category.id, { kategori: category.category_name, jumlah_work_order: 0, total_jam: 0 });
          const entry = categories.get(category.id);
          entry.jumlah_work_order++;
          entry.total_jam += hoursByOrder.get(detail.order_id) || 0;
        }
        return { berdasarkan_kategori: [...categories.values()].map(x => ({ kategori: x.kategori, jumlah_work_order: x.jumlah_work_order, rata_rata_jam: x.total_jam / x.jumlah_work_order })).sort((a, b) => b.jumlah_work_order - a.jumlah_work_order || a.kategori.localeCompare(b.kategori)).slice(0, 10), jumlah_work_order_valid: valid.length, catatan: 'Periode berdasarkan tanggal pembuatan work order; hanya durasi mulai-selesai valid. Durasi milik seluruh work order, bukan tiap item. Satu work order dapat muncul di beberapa kategori; work order tanpa kategori tidak masuk rincian.' };
      }
      case 'get_csi_template_breakdown': {
        const groups = await this.db.csi_answers.groupBy({ by: ['csi_template_id'], where: filter, _count: { _all: true }, orderBy: { _count: { csi_template_id: 'desc' } }, take: 10 });
        const templates = await this.db.csi_template.findMany({ where: { id: { in: groups.map(x => x.csi_template_id) } }, select: { id: true, name: true } });
        return { berdasarkan_template: groups.map(x => ({ template: templates.find(t => t.id === x.csi_template_id)?.name || `Template ${x.csi_template_id}`, jumlah_jawaban: x._count._all })), catatan: 'Sepuluh template menurut jumlah jawaban; periode berdasarkan tanggal pembuatan jawaban. Skor belum dapat dihitung karena format jawaban belum divalidasi.' };
      }
      case 'get_work_start_patterns': {
        const rows = await this.db.work_orders.findMany({ where: { ...filter, work_start_date: { not: null } }, select: { work_start_date: true }, take: 20001, orderBy: { id: 'asc' } });
        if (rows.length > 20000) throw new BadRequestException('Data terlalu banyak; gunakan periode yang lebih pendek.');
        const hours = Array(24).fill(0); rows.forEach(row => hours[row.work_start_date.getUTCHours()]++);
        return { berdasarkan_jam_utc: hours.map((jumlah, jam) => ({ jam, jumlah })), jumlah_work_order: rows.length, catatan: 'Jam berdasarkan UTC; periode berdasarkan tanggal pembuatan work order. Hanya work order dengan waktu mulai tercatat.' };
      }
      case 'get_top_order_vendors': {
        const groups = await this.db.orders.groupBy({ by: ['vendor_id'], where: { ...filter, vendor_id: { not: null } }, _count: { _all: true }, orderBy: { _count: { vendor_id: 'desc' } }, take: 10 });
        const vendors = await this.db.vendor.findMany({ where: { id: { in: groups.map(x => x.vendor_id) } }, select: { id: true, company_name: true } });
        return { peringkat_vendor: groups.map(x => ({ vendor: vendors.find(v => v.id === x.vendor_id)?.company_name || `Vendor ${x.vendor_id}`, jumlah_order: x._count._all })), catatan: 'Sepuluh vendor berdasarkan jumlah order semua status; nama vendor dapat berupa nama perorangan. Periode berdasarkan tanggal pembuatan order.' };
      }
      case 'get_top_order_categories': {
        // A single order can contain multiple details in the same category.
        // Group by order and item first; deduplicate by order within each category.
        const [groups, unknownDetails] = await Promise.all([
          this.db.m_order_details.groupBy({
            by: ['order_id', 'item_id'],
            where: { deleted_at: null, item_id: { not: null }, order: filter },
            _sum: { quantity: true },
            orderBy: [{ order_id: 'asc' }, { item_id: 'asc' }],
            take: 50001,
          }),
          this.db.m_order_details.count({ where: { deleted_at: null, item_id: null, order: filter } }),
        ]);
        if (groups.length > 50000) throw new BadRequestException('Data terlalu banyak untuk dihitung dengan aman; gunakan periode yang lebih pendek.');
        const itemIds = [...new Set(groups.map(group => group.item_id))];
        const items = [];
        for (let offset = 0; offset < itemIds.length; offset += 1000) {
          items.push(...await this.db.items.findMany({
            where: { id: { in: itemIds.slice(offset, offset + 1000) } },
            select: { id: true, category: { select: { id: true, category_name: true } } },
          }));
        }
        const categoriesByItem = new Map(items.map(item => [item.id, item.category]));
        const categories = new Map<number, { kategori: string; orders: Set<number>; kuantitas: number }>();
        let unknownGroups = 0;
        for (const group of groups) {
          const category = categoriesByItem.get(group.item_id);
          if (!category) { unknownGroups++; continue; }
          if (!categories.has(category.id)) categories.set(category.id, { kategori: category.category_name, orders: new Set(), kuantitas: 0 });
          const entry = categories.get(category.id);
          entry.orders.add(group.order_id);
          entry.kuantitas += group._sum.quantity || 0;
        }
        const ranking = [...categories.values()].map(entry => ({ kategori: entry.kategori, jumlah_order: entry.orders.size, kuantitas: entry.kuantitas }))
          .sort((a, b) => b.jumlah_order - a.jumlah_order || b.kuantitas - a.kuantitas || a.kategori.localeCompare(b.kategori));
        return { periode: { dari: input.from || null, sampai: input.to || null }, peringkat: ranking.slice(0, 10), jumlah_kategori: ranking.length,
          detail_tanpa_item: unknownDetails, kelompok_item_tidak_ditemukan: unknownGroups,
          catatan: 'Peringkat berdasarkan jumlah order unik per kategori, lalu kuantitas; tanggal berdasarkan pembuatan order dan termasuk semua status. Satu order dapat muncul pada lebih dari satu kategori. Detail tanpa kategori tidak masuk peringkat.' };
      }
      case 'get_work_order_summary': {
        const rows = await this.db.work_orders.findMany({ where: { ...filter, work_start_date: { not: null }, work_end_date: { not: null } }, select: { work_start_date: true, work_end_date: true }, take: 20001, orderBy: { id: 'asc' } });
        const truncated = rows.length > 20000;
        const durations = rows.slice(0, 20000).map(x => (x.work_end_date.getTime() - x.work_start_date.getTime()) / 3600000).filter(x => x >= 0);
        return { jumlah_durasi_valid: durations.length, rata_rata_jam: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null, terpotong: truncated, catatan: 'Berdasarkan work order dengan waktu mulai dan selesai valid; jenis layanan belum terhubung langsung pada detail order.' };
      }
      case 'get_work_patterns': {
        const rows = await this.db.work_orders.findMany({ where: { ...filter, work_start_date: { not: null } }, select: { work_start_date: true }, take: 20001, orderBy: { id: 'asc' } });
        const hours = Array(24).fill(0); rows.slice(0, 20000).forEach(x => hours[x.work_start_date.getUTCHours()]++);
        const assignments = await this.db.work_order_tukang.count({ where: { deleted_at: null, work_orders: filter } });
        return { jam_mulai_utc: hours.map((jumlah, jam) => ({ jam, jumlah })), jumlah_penugasan_tukang: assignments, terpotong: rows.length > 20000, catatan: 'Jam menggunakan UTC; penugasan dihitung berdasarkan tanggal pembuatan work order.' };
      }
      case 'get_complaint_summary': {
        const groups = await this.db.complaints.groupBy({ by: ['complaint_channel'], where: filter, _count: { _all: true } });
        const ids = groups.map(x => x.complaint_channel).filter(id => id !== null);
        const channels = await this.db.complaint_channels.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
        return { total: groups.reduce((n, x) => n + x._count._all, 0), berdasarkan_channel: groups.map(x => ({ kanal: x.complaint_channel === null ? 'Tidak tersedia' : channels.find(c => c.id === x.complaint_channel)?.name || `Kanal ${x.complaint_channel}`, jumlah: x._count._all })).sort((a, b) => b.jumlah - a.jumlah), catatan: 'Periode berdasarkan tanggal pembuatan pengaduan.' };
      }
      case 'get_vendor_summary': {
        const [vendors, tukang, orders] = await Promise.all([this.db.vendor.count({ where: { is_active: true, deleted_at: null } }), this.db.tukang.count({ where: { is_active: true, deleted_at: null } }), this.db.orders.groupBy({ by: ['vendor_id'], where: { ...filter, vendor_id: { not: null } }, _count: { _all: true }, orderBy: { _count: { vendor_id: 'desc' } }, take: 10 })]);
        return { vendor_aktif_saat_ini: vendors, tukang_aktif_saat_ini: tukang, vendor_teratas: orders.map(x => ({ vendor_id: x.vendor_id, jumlah_order: x._count._all })), catatan: 'Status aktif adalah kondisi saat ini; peringkat dihitung berdasarkan tanggal pembuatan order.' };
      }
      case 'get_csi_summary': return { jumlah_jawaban: await this.db.csi_answers.count({ where: filter }), skor: null, catatan: 'Skor tidak tersedia: struktur jawaban CSI perlu dipetakan dan divalidasi terlebih dahulu.' };
    }
  }
}
