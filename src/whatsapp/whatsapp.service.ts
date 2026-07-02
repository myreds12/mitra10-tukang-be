import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

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

    const pdfUrl = `${this.getPublicBaseUrl()}/orders/quotation-pdf/${quotation.order_id}`;
    await this.sendTemplate(phoneNumber, 'survei_tukang_instalasi_quotation_v2', {
      customerName: quotation.order?.members?.full_name ?? '-',
      bankName: quotation.store?.bank_name ?? '-',
      accountNumber: quotation.store?.bank_number ?? '-',
      storeWhatsappNumber:
        this.normalizePhone(
          quotation.store?.phone_number_1 ?? quotation.store?.phone_number_2,
        ) ?? '-',
      media: {
        mediaLink: pdfUrl,
      },
    });
  }

  async sendOrderCreatedNotification(orderId: number) {
    const order = await this.dbService.orders.findFirst({
      where: { id: orderId, deleted_at: null },
      include: {
        status: true,
        members: true,
        store: true,
        m_order_details: { where: { deleted_at: null } },
      },
    });

    if (!order) {
      return;
    }

    const phoneNumber = this.normalizePhone(
      order.members?.whatsapp_number ?? order.members?.phone_number,
    );
    if (!phoneNumber) {
      this.logger.warn(
        `Skipping order-created WA for order_id=${orderId}: customer number not found`,
      );
      return;
    }

    const itemNames =
      order.m_order_details
        ?.map((d) => d.item_name ?? '-')
        .filter(Boolean)
        .join(', ') ?? '-';

    await this.sendTemplate(
      phoneNumber,
      'survei_tukang_instalasi_order_created_v1',
      {
        customerName: order.members?.full_name ?? '-',
        orderId: String(order.id),
        storeName: order.store?.store_name ?? '-',
        itemName: itemNames,
        surveyDate: this.formatDateTime(order.request_survey ?? order.created_at),
      },
    );
  }

  async sendTukangAssignedNotification(workOrderId: number) {
    const workOrder = await this.dbService.work_orders.findFirst({
      where: { id: workOrderId, deleted_at: null },
      include: {
        order: {
          include: {
            members: true,
            store: true,
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
      workOrder.work_order_tukang
        .map((item) => item.tukang?.full_name)
        .filter(Boolean)
        .join(', ') || '-';

    await this.sendTemplate(
      phoneNumber,
      'survei_tukang_instalasi_assign_tukang_v1',
      {
        customerName: workOrder.order?.members?.full_name ?? '-',
        orderId: String(workOrder.order_id),
        storeName: workOrder.order?.store?.store_name ?? '-',
        craftsmanName,
        surveyDate: this.formatDateTime(
          workOrder.request_work_time ??
            workOrder.survey_date ??
            workOrder.created_at,
        ),
      },
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

    if (!order || order.status?.category !== 'WORKEND') {
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

  async sendWorkOrderStatusNotification(workOrderId: number) {
    const workOrder = await this.dbService.work_orders.findFirst({
      where: { id: workOrderId, deleted_at: null },
      include: {
        status: true,
        work_order_status: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          include: {
            status: true,
          },
        },
        work_order_evidences: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
        },
        work_order_tukang: {
          where: { deleted_at: null },
          include: {
            tukang: true,
          },
        },
        order: {
          include: {
            members: true,
            store: true,
          },
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
        `Skipping process WA for work_order_id=${workOrderId}: customer number not found`,
      );
      return;
    }

    const latestStatus =
      workOrder.work_order_status.find((item) => item.status) ?? null;
    const latestStatusCategory =
      latestStatus?.status?.category ?? workOrder.status?.category ?? null;

    if (latestStatusCategory === 'WORKEND') {
      await this.sendTemplate(
        phoneNumber,
        'survei_tukang_instalasi_selesai_v3',
        {
          customerName: workOrder.order?.members?.full_name ?? '-',
          orderId: String(workOrder.order_id),
        },
      );
      return;
    }

    const latestImage = workOrder.work_order_evidences.find(
      (item) => item.evidence_location,
    );
    const craftsmanName =
      workOrder.work_order_tukang
        .map((item) => item.tukang?.full_name)
        .filter(Boolean)
        .join(', ') || '-';

    const params: Record<string, unknown> = {
      customerName: workOrder.order?.members?.full_name ?? '-',
      storeName: workOrder.order?.store?.store_name ?? '-',
      orderId: String(workOrder.order_id),
      surveyName:
        latestStatus?.status?.description ?? workOrder.status?.description ?? '-',
      craftsmanName: craftsmanName,
      surveyDate: this.formatDateTime(
        workOrder.request_work_time ?? workOrder.updated_at ?? new Date(),
      ),
    };

    if (latestImage?.evidence_location) {
      params.media = {
        mediaLink: `${this.getPublicBaseUrl()}/public/work-orders/${latestImage.evidence_location}`,
      };
    }

    await this.sendTemplate(
      phoneNumber,
      'survei_tukang_instalasi_proses_v1',
      params,
    );
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

  private formatDateTime(value: Date | string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
