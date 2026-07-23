import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly processTemplateId = 'survei_tukang_instalasi_proses_v2';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly dbService: PrismaService,
  ) {}

  async sendQuotationNotification(quotationId: number) {
    const quotation = await this.dbService.quotation.findFirst({
      where: { id: quotationId, deleted_at: null },
      include: {
        status: true,
        store: true,
        order: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!quotation || quotation.status?.category !== 'QUOTEOUT') {
      return;
    }

    const phoneNumber = this.normalizePhone(
      quotation.order?.members?.whatsapp_number ??
        quotation.order?.members?.phone_number,
    );
    if (!phoneNumber) {
      this.logger.warn(
        `Skipping quotation WA for quotation_id=${quotationId}: customer number not found`,
      );
      return;
    }

    const customerName =
      quotation.order?.members?.full_name?.replace(/[^a-zA-Z0-9 ]/g, '') ??
      'Customer';
    const filename = encodeURIComponent(
      `Quotation - ${customerName} - Order ID : ${quotation.order_id}.pdf`,
    );
    const quotationFilename = `Quotation - ${customerName} - Order ID : ${quotation.order_id}.pdf`;
    const pdfUrl = `${this.getPublicBaseUrl()}/orders/quotation-pdf/${quotation.order_id}/${filename}`;
    await this.sendTemplate(phoneNumber, 'survei_tukang_instalasi_quotation_v2', {
      customerName: quotation.order?.members?.full_name ?? '-',
      bankName: quotation.store?.bank_name ?? '-',
      accountNumber: quotation.store?.bank_number ?? '-',
      storeWhatsappNumber:
        this.normalizePhone(
          quotation.store?.phone_number_1 ?? quotation.store?.phone_number_2,
        ) ?? '-',
      media: {
        title: quotationFilename,
        mediaLink: pdfUrl,
      },
    });
  }

  async sendTukangAssignedNotification(workOrderId: number) {
    const workOrder = await this.dbService.work_orders.findFirst({
      where: { id: workOrderId, deleted_at: null },
      include: {
        status: true,
        order: {
          include: {
            members: true,
            store: true,
            m_order_details: {
              where: { deleted_at: null },
              take: 1,
            },
          },
        },
        work_order_tukang: {
          where: { deleted_at: null },
          include: { tukang: true },
        },
      },
    });

    if (!workOrder) {
      return;
    }

    const phoneNumber = this.normalizePhone(
      workOrder.order?.members?.whatsapp_number ??
        workOrder.order?.members?.phone_number,
    );
    if (!phoneNumber) {
      this.logger.warn(
        `Skipping assign-tukang WA for work_order_id=${workOrderId}: customer number not found`,
      );
      return;
    }

    const craftsmanName =
      [
        ...new Set(
          workOrder.work_order_tukang
            .map((item) => item.tukang?.full_name)
            .filter(Boolean),
        ),
      ].join(', ') || '-';

    await this.sendTemplate(
      phoneNumber,
      this.processTemplateId,
      this.buildProcessParams({
        customerName: workOrder.order?.members?.full_name ?? '-',
        storeName: workOrder.order?.store?.store_name ?? '-',
        orderId: String(workOrder.order_id),
        surveyName: workOrder.order?.m_order_details?.[0]?.item_name ?? workOrder.status?.description ?? '-',
        craftsmanName,
        surveyDate: this.formatDateTimeRange(
          workOrder.work_start_date ?? workOrder.request_work_time ?? workOrder.survey_date ?? workOrder.created_at,
          workOrder.work_end_date,
        ),
      }),
    );
  }

  async sendOrderCompletedNotification(orderId: number) {
    const order = await this.dbService.orders.findFirst({
      where: { id: orderId, deleted_at: null },
      include: {
        status: true,
        members: true,
      },
    });

    if (!order || !order.status?.category?.startsWith('WORKEND')) {
      return;
    }

    const phoneNumber = this.normalizePhone(
      order.members?.whatsapp_number ?? order.members?.phone_number,
    );
    if (!phoneNumber) {
      this.logger.warn(
        `Skipping completion WA for order_id=${orderId}: customer number not found`,
      );
      return;
    }

    await this.sendTemplate(phoneNumber, 'survei_tukang_instalasi_selesai_v3', {
      customerName: order.members?.full_name ?? '-',
      orderId: String(order.id),
    });
  }

  private buildProcessParams(params: {
    customerName: string;
    storeName: string;
    orderId: string;
    surveyName: string;
    craftsmanName: string;
    surveyDate: string;
  }): Record<string, string> {
    return {
      customerName: params.customerName,
      storeName: params.storeName,
      orderId: params.orderId,
      surveyName: params.surveyName,
      craftsmanName: params.craftsmanName,
      cratftsmanName: params.craftsmanName,
      surveyDate: params.surveyDate,
    };
  }

  private async sendTemplate(
    customerPhoneNumber: string,
    templateId: string,
    params: Record<string, unknown>,
  ) {
    const apiUrl =
      this.configService.get<string>('WA_API_URL') ??
      'https://r0.cloud.yellow.ai/api/engagements/notifications/v2/push?bot=x1657090256339';
    const apiKey = this.configService.get<string>('WA_API_KEY');
    const sender =
      this.configService.get<string>('WA_SENDER') ?? '6287800021010';

    if (!apiKey) {
      this.logger.warn(
        `Skipping WhatsApp template ${templateId}: WA_API_KEY is not configured`,
      );
      return;
    }

    const payload = {
      userDetails: {
        number: customerPhoneNumber,
      },
      notification: {
        type: 'whatsapp',
        sender,
        templateId,
        params,
      },
    };

    this.logger.log(
      `Sending WhatsApp template=${templateId} payload=${JSON.stringify(payload)}`,
    );

    try {
      const response = await lastValueFrom(
        this.httpService.post(apiUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
        }),
      );

      this.logger.log(
        `WhatsApp sent template=${templateId} status=${response.status} data=${JSON.stringify(
          response.data,
        )}`,
      );
    } catch (error) {
      this.logger.error(
        `WhatsApp send failed template=${templateId} error=${error?.message}`,
      );
      if (error?.response?.data) {
        this.logger.error(JSON.stringify(error.response.data));
      }
    }
  }

  private normalizePhone(number?: string | null) {
    if (!number) {
      return null;
    }

    const sanitized = number.replace(/\D/g, '');
    if (!sanitized) {
      return null;
    }

    if (sanitized.startsWith('62')) {
      return sanitized;
    }

    if (sanitized.startsWith('0')) {
      return `62${sanitized.slice(1)}`;
    }

    return `62${sanitized}`;
  }

  private getPublicBaseUrl() {
    const apiUrl =
      this.configService.get<string>('WA_PUBLIC_BASE_URL') ??
      this.configService.get<string>('API_URL') ??
      'http://localhost:3039';

    return apiUrl.replace(/\/$/, '');
  }

  private formatDateTimePart(value: Date | string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };

    const parts = new Intl.DateTimeFormat('id-ID', options).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

    return `${get('day')}-${get('month')}-${get('year')} pukul ${get('hour')}:${get('minute')}`;
  }

  private formatDateTimeRange(start: Date | string, end?: Date | string | null) {
    const startStr = this.formatDateTimePart(start);
    if (!end) return startStr;

    const endStr = this.formatDateTimePart(end);
    return `${startStr} sampai ${endStr}`;
  }
}
