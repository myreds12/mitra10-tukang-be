import { of, throwError } from 'rxjs';
import { WhatsAppService } from './whatsapp.service';

describe('WhatsApp notification delivery', () => {
  let service: WhatsAppService;
  let db: any;
  let http: any;

  beforeEach(() => {
    db = {
      quotation: { findFirst: jest.fn() },
      orders: { findFirst: jest.fn() },
      work_orders: { findFirst: jest.fn() },
    };
    http = { post: jest.fn().mockReturnValue(of({ status: 202, data: {} })) };
    const settings = {
      WA_API_KEY: 'test-key',
      WA_PUBLIC_BASE_URL: 'https://api.example.test',
    };
    service = new WhatsAppService(
      http,
      { get: (key) => settings[key] } as any,
      db,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('sends quotation v3 with a public PDF and named parameters', async () => {
    db.quotation.findFirst.mockResolvedValue({
      id: 12,
      order_id: 55,
      status: { category: 'QUOTEOUT' },
      store: {
        bank_name: 'Bank',
        bank_number: '123',
        phone_number_1: '08123456789',
      },
      order: {
        members: { full_name: 'Customer', whatsapp_number: '+628123456789' },
      },
    });
    await service.sendQuotationNotification(12);
    expect(http.post).toHaveBeenCalledWith(
      expect.any(String),
      {
        userDetails: { number: '628123456789' },
        notification: {
          type: 'whatsapp',
          sender: '6287800021010',
          templateId: 'survei_tukang_instalasi_quotation_v3',
          params: {
            customerName: 'Customer',
            bankName: 'Bank',
            accountNumber: '123',
            storeWhatsappNumber: '628123456789',
            media: {
              title: expect.any(String),
              mediaLink: expect.stringMatching(
                /^https:\/\/api.example.test\/orders\/quotation-pdf\/55\//,
              ),
            },
          },
        },
      },
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
      }),
    );
  });

  it('uses the completed WO when the parent order has a different status', async () => {
    db.work_orders.findFirst.mockResolvedValue({
      status: { category: 'WORKENDSTEPONE' },
    });
    db.orders.findFirst.mockResolvedValue({
      id: 55,
      status: { category: 'INVESTIGATED' },
      members: { full_name: 'Customer', whatsapp_number: '08123456789' },
    });
    await service.sendOrderCompletedNotification(55, 77);
    expect(db.work_orders.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 77, order_id: 55, deleted_at: null },
      }),
    );
    expect(http.post.mock.calls[0][1].notification).toEqual({
      type: 'whatsapp',
      sender: '6287800021010',
      templateId: 'survei_tukang_instalasi_selesai_v4',
      params: { customerName: 'Customer', orderId: '55' },
    });
  });

  it('does not send completion for a missing or unfinished WO', async () => {
    db.work_orders.findFirst.mockResolvedValue(null);
    db.orders.findFirst.mockResolvedValue({
      id: 55,
      status: { category: 'WORKEND' },
    });
    await service.sendOrderCompletedNotification(55, 77);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('retries a temporary API failure', async () => {
    jest.useFakeTimers();
    http.post.mockReturnValueOnce(
      throwError(() => ({ response: { status: 503 }, message: 'Unavailable' })),
    );
    const pending = (service as any).sendTemplate(
      '628123456789',
      'template',
      {},
    );
    await jest.runAllTimersAsync();
    await pending;
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('surfaces invalid payload failures without retrying', async () => {
    http.post.mockReturnValue(
      throwError(() => ({
        response: { status: 400 },
        message: 'Invalid params',
      })),
    );
    await expect(
      (service as any).sendTemplate('628123456789', 'template', {}),
    ).rejects.toThrow('Invalid params');
    expect(http.post).toHaveBeenCalledTimes(1);
  });
});
