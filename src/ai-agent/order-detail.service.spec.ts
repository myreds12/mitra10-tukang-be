import { OrderDetailService, formatOrderDetail, resolveFullOrderIntent } from './order-detail.service';
import { catalogKeys, dataCatalog } from './data-catalog';

describe('Complete order detail', () => {
  it('recognizes the reported request without swallowing narrower or multiple-order requests', () => {
    expect(resolveFullOrderIntent('tampilkan data lengkap untuk order id 6911')).toBe(6911);
    expect(resolveFullOrderIntent('tampilkan data order #6911 secara lengkap')).toBe(6911);
    expect(resolveFullOrderIntent('data lengkap untuk id order: 6911')).toBe(6911);
    for (const question of ['hapus data lengkap order 6911', 'data lengkap order 6911 tanpa kontak', 'data lengkap order 6911 dan 6912', 'data lengkap order 0', 'data lengkap order 2147483648', 'item order 6911']) {
      expect(resolveFullOrderIntent(question)).toBeNull();
    }
  });

  it('returns every permitted order column and linked items/invoices instead of the 11-column summary', async () => {
    const db: any = Object.fromEntries(Object.keys(dataCatalog).map(dataset => [dataset, { findMany: jest.fn().mockResolvedValue([]) }]));
    const order = Object.fromEntries(dataCatalog.orders.map(field => [field.name, null]));
    Object.assign(order, { id: 6911, project_status_id: 7, receipt_number: 'RECEIPT-TEST', request_survey: new Date('2026-11-12T00:00:00Z') });
    db.orders.findMany.mockResolvedValue([order]);
    db.status.findMany.mockResolvedValue([{ id: 7, description: 'Permintaan Perintah Kerja' }]);
    db.m_order_details.findMany.mockResolvedValue([{ order_id: 6911, item_id: 12, item_name: 'Item lengkap', quantity: 2 }]);
    db.invoice_details.findMany.mockResolvedValue([{ order_id: 6911, invoice_id: 21 }]);
    const result = await new OrderDetailService(db).read(6911, catalogKeys);
    const root = result.sections[0];
    expect(root.fields).toEqual(dataCatalog.orders.map(field => field.name));
    expect(root.fields.length).toBeGreaterThan(11);
    expect(db.orders.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [6911] }, deleted_at: null }, select: Object.fromEntries(root.fields.map(field => [field, true])) }));
    expect(db.m_order_details.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { order_id: { in: [6911] }, deleted_at: null } }));
    expect(db.items.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [12] }, deleted_at: null } }));
    expect(db.invoices.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [21] }, deleted_at: null } }));
    const answer = formatOrderDetail(6911, result);
    for (const field of root.fields) expect(answer).toContain(field);
    expect(answer).toContain('RECEIPT-TEST');
    expect(answer).toContain('Item lengkap');
    expect(answer).toContain('Permintaan Perintah Kerja');
    expect(answer).toContain('2026-11-12T00:00:00.000Z');
    expect(answer).not.toContain('Artinya pekerjaan');
  });

  it('never reads disabled output fields or uses disabled join keys', async () => {
    const db: any = { orders: { findMany: jest.fn().mockResolvedValue([{ id: 6911, receipt_number: 'VISIBLE' }]) }, members: { findMany: jest.fn() }, m_order_details: { findMany: jest.fn() } };
    const allowed = ['db.orders.id', 'db.orders.receipt_number', 'db.members.id', 'db.members.full_name', 'db.m_order_details.item_name'];
    const result = await new OrderDetailService(db).read(6911, allowed);
    expect(db.orders.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: { id: true, receipt_number: true } }));
    expect(db.members.findMany).not.toHaveBeenCalled();
    expect(db.m_order_details.findMany).not.toHaveBeenCalled();
    expect(result.sections).toHaveLength(1);
    expect(result.limitations.join(' ')).toContain('orders.member_id');
    expect(result.limitations.join(' ')).toContain('m_order_details');
    await expect(new OrderDetailService(db).read(6911, ['orders.order_id'])).rejects.toThrow('aktifkan kolom id');
    expect(db.orders.findMany).toHaveBeenCalledTimes(1);
  });

  it('stops at a missing order and clearly reports capped rows and long cells', async () => {
    const db: any = { orders: { findMany: jest.fn().mockResolvedValue([]) } };
    const missing = await new OrderDetailService(db).read(6911, ['db.orders.id']);
    expect(formatOrderDetail(6911, missing)).toContain('tidak ditemukan');
    db.orders.findMany.mockResolvedValue([{ id: 6911 }]);
    db.m_order_details = { findMany: jest.fn().mockResolvedValue(Array.from({ length: 51 }, () => ({ order_id: 6911, item_name: 'x'.repeat(4100) + 'TAIL_SECRET_TEST' }))) };
    const result = await new OrderDetailService(db).read(6911, ['db.orders.id', 'db.m_order_details.order_id', 'db.m_order_details.item_name']);
    expect(result.sections.find(section => section.dataset === 'm_order_details').data).toHaveLength(50);
    const answer = formatOrderDetail(6911, result);
    expect(answer).toContain('masih ada data yang belum ditampilkan');
    expect(answer).toContain('[teks dipotong]');
    expect(answer).not.toContain('TAIL_SECRET_TEST');
  });
});
