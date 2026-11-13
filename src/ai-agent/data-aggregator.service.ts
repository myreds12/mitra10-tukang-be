import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const TOOL_NAMES = ['get_transaction_summary', 'get_work_order_summary', 'get_work_patterns', 'get_complaint_summary', 'get_vendor_summary', 'get_csi_summary'] as const;

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
        return { total: groups.reduce((n, x) => n + x._count._all, 0), berdasarkan_channel: groups.map(x => ({ channel_id: x.complaint_channel, jumlah: x._count._all })) };
      }
      case 'get_vendor_summary': {
        const [vendors, tukang, orders] = await Promise.all([this.db.vendor.count({ where: { is_active: true, deleted_at: null } }), this.db.tukang.count({ where: { is_active: true, deleted_at: null } }), this.db.orders.groupBy({ by: ['vendor_id'], where: { ...filter, vendor_id: { not: null } }, _count: { _all: true }, orderBy: { _count: { vendor_id: 'desc' } }, take: 10 })]);
        return { vendor_aktif_saat_ini: vendors, tukang_aktif_saat_ini: tukang, vendor_teratas: orders.map(x => ({ vendor_id: x.vendor_id, jumlah_order: x._count._all })), catatan: 'Status aktif adalah kondisi saat ini; peringkat dihitung berdasarkan tanggal pembuatan order.' };
      }
      case 'get_csi_summary': return { jumlah_jawaban: await this.db.csi_answers.count({ where: filter }), skor: null, catatan: 'Skor tidak tersedia: struktur jawaban CSI perlu dipetakan dan divalidasi terlebih dahulu.' };
    }
  }
}
