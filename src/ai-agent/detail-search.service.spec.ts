import { DetailSearchService } from './detail-search.service';

const fields = ['orders.order_id', 'orders.tanggal_order', 'orders.bulan', 'orders.kuartal', 'orders.tahun', 'orders.status', 'orders.vendor', 'orders.store', 'orders.kategori', 'orders.grand_total', 'orders.jml_item', 'vendors.vendor_id', 'vendors.status_aktif'];

describe('Read-only detail search', () => {
  it('returns only permitted order fields and uses the provided filters', async () => {
    const orders = { findMany: jest.fn().mockResolvedValue([{ id: 7, status: { description: 'Selesai' }, vendor: { company_name: 'CV Contoh' }, grand_total: 10000 }]) };
    const svc = new DetailSearchService({ orders } as any);
    const result = await svc.run('search_orders', { vendor: 'Contoh', status: 'Selesai', fields: ['vendor', 'status', 'grand_total'] }, fields);
    expect(result.data).toEqual([{ order_id: 7, status: 'Selesai', vendor: 'CV Contoh', grand_total: 10000 }]);
    expect(orders.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ vendor: { is: { company_name: { contains: 'Contoh' } } } }), select: { id: true, status: { select: { description: true } }, vendor: { select: { company_name: true } }, grand_total: true } }));
    expect(JSON.stringify(orders.findMany.mock.calls)).not.toMatch(/project_number|project_address|phone|member/);
  });
  it('rejects disabled fields and filters before reading from the database', async () => {
    const db = { orders: { findMany: jest.fn() } };
    const svc = new DetailSearchService(db as any);
    await expect(svc.run('search_orders', { vendor: 'Contoh' }, ['orders.order_id'])).rejects.toThrow('orders.vendor');
    await expect(svc.run('search_orders', { fields: ['status'] }, ['orders.order_id'])).rejects.toThrow('orders.status');
    await expect(svc.run('search_orders', { order_number: '123' }, fields)).rejects.toThrow('Parameter pencarian tidak valid');
    expect(db.orders.findMany).not.toHaveBeenCalled();
  });
  it('validates period, limits and cursor, and reports additional results', async () => {
    const orders = { findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]) };
    const svc = new DetailSearchService({ orders } as any);
    const result: any = await svc.run('search_orders', { from: '2026-11-01', to: '2026-11-13', limit: 2, fields: ['order_id'] }, fields);
    expect(result.data).toEqual([{ order_id: 1 }, { order_id: 2 }]);
    expect(result.masih_ada_data).toBe(true);
    expect(result.after_order_id_berikutnya).toBe(2);
    await expect(svc.run('search_orders', { limit: 51 }, fields)).rejects.toThrow();
    await expect(svc.run('search_orders', { from: '2026-02-30' }, fields)).rejects.toThrow();
    await expect(svc.run('search_orders', { from: '2026-11-01' }, ['orders.order_id', 'orders.tanggal_order'])).rejects.toThrow('orders.bulan');
  });
  it('does not calculate a partial quantity as if complete', async () => {
    const rows = Array.from({ length: 51 }, () => ({ quantity: 1 }));
    const svc = new DetailSearchService({ orders: { findMany: jest.fn().mockResolvedValue([{ id: 1, m_order_details: rows }]) } } as any);
    const result = await svc.run('search_orders', { fields: ['jml_item'] }, fields);
    expect(result.data).toEqual([{ order_id: 1, jml_item: null, detail_item_terpotong: true }]);
  });
  it('returns vendor details only when allowed and rejects an inactive field filter', async () => {
    const vendor = { findMany: jest.fn().mockResolvedValue([{ id: 4, company_name: 'CV Contoh', is_active: true }]) };
    const svc = new DetailSearchService({ vendor } as any);
    const result = await svc.run('search_vendors', { vendor: 'Contoh', status_aktif: true }, fields);
    expect(result.data).toEqual([{ nama_vendor: 'CV Contoh', vendor_id: 4, status_aktif: true }]);
    await expect(svc.run('search_vendors', { status_aktif: true }, ['orders.vendor'])).rejects.toThrow('vendors.status_aktif');
    expect(vendor.findMany).toHaveBeenCalledTimes(1);
  });
});
