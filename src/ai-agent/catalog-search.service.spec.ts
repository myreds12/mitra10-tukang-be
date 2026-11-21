import { CatalogSearchService } from './catalog-search.service';

describe('CatalogSearchService', () => {
  const db: any = { orders: { findMany: jest.fn() }, members: { findMany: jest.fn() } };
  const service = new CatalogSearchService(db);
  beforeEach(() => jest.resetAllMocks());
  it('discovers only explicitly enabled columns', () => {
    const result: any = service.describe({ dataset: 'orders' }, ['db.orders.id']);
    expect(result.datasets[0].fields).toEqual([{ name: 'id', type: 'Int' }]);
    expect(service.describe({}, []).datasets).toEqual([]);
  });
  it('reads only requested and enabled personal fields', async () => {
    db.orders.findMany.mockResolvedValue([{ id: 1, project_number: '0812' }]);
    const result = await service.search({ dataset: 'orders', fields: ['id', 'project_number'], filters: [{ field: 'id', operator: 'equals', value: 1 }] }, ['db.orders.id', 'db.orders.project_number']);
    expect(result.data).toEqual([{ id: 1, project_number: '0812' }]);
    expect(db.orders.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: { id: true, project_number: true }, where: { id: { equals: 1 } } }));
  });
  it('rejects disabled output and filter fields before querying', async () => {
    await expect(service.search({ dataset: 'orders', fields: ['project_number'] }, ['db.orders.id'])).rejects.toThrow('belum diizinkan');
    await expect(service.search({ dataset: 'orders', fields: ['id'], filters: [{field: 'project_number', operator: 'contains', value: '0812'}] }, ['db.orders.id'])).rejects.toThrow('belum diizinkan');
    expect(db.orders.findMany).not.toHaveBeenCalled();
  });
  it('requires the order reference and item name permissions before looking up order items', async () => {
    db.m_order_details = { findMany: jest.fn() };
    await expect(service.orderItems(6911, ['db.m_order_details.order_id'])).rejects.toThrow('m_order_details.item_name');
    expect(db.m_order_details.findMany).not.toHaveBeenCalled();
  });
  it('lists only enabled item fields and paginates without exposing deleted records', async () => {
    db.items = { findMany: jest.fn().mockResolvedValue([{item_name: 'Keramik'}]) };
    const result = await service.listItems(2, ['db.items.item_name']);
    expect(result.data).toEqual([{item_name: 'Keramik'}]);
    expect(db.items.findMany).toHaveBeenCalledWith(expect.objectContaining({where: {deleted_at: null}, select: {item_name: true}, skip: 50, take: 51}));
    await expect(service.listItems(1, ['db.items.id'])).rejects.toThrow('Aktifkan setidaknya');
  });
  it('does not expose credentials or agent history even if requested', async () => {
    expect(service.describe({ dataset: 'users' }, ['db.users.password']).datasets).toEqual([]);
    await expect(service.search({ dataset: 'ai_agent_message', fields: ['content'] }, ['db.ai_agent_message.content'])).rejects.toThrow();
  });
  it('rejects large results rather than skipping rows on the next page', async () => {
    db.orders.findMany.mockResolvedValue([{notes: 'a'.repeat(17000)}]);
    await expect(service.search({dataset: 'orders', fields: ['notes']}, ['db.orders.notes'])).rejects.toThrow('Hasil terlalu besar');
  });
});
