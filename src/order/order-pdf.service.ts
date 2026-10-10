/* eslint-disable prettier/prettier */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PdfService } from 'src/common/service/pdf.service';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { MailType } from 'src/mails/enum/mail_type.enum';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';
import { join } from 'path';

@Injectable()
export class OrderPdfService {
  private readonly logger = new Logger(OrderPdfService.name);

  constructor(
    private readonly dbService: PrismaService,
    private readonly pdfService: PdfService,
    private readonly configService: ConfigService,
  ) {}

  async quotationPdf(order_id: number, res: Response) {
    const quotation = await this.dbService.quotation.findFirst({
      where: {
        order_id: order_id,
        deleted_at: null,
        order: {
          deleted_at: null,
        },
      },
      include: {
        promotion: true,
        quotation_files: true,
        quotation_details: {
          where: {
            deleted_at: null,
          },
          include: {
            category: true,
          },
        },
        order: {
          include: {
            m_order_details: {
              where: {
                deleted_at: null,
              },
              include: {
                item: true,
              },
            },
            members: true,
            vendor: true,
            work_orders: {
              include: {
                work_order_evidences: true,
                work_order_status: {
                  orderBy: {
                    id: 'desc',
                  },
                  include: {
                    work_order_items: {
                      orderBy: {
                        id: 'desc',
                      },
                    },
                  },
                },
                work_order_tukang: true,
                status: true,
              },
            },
          },
        },
        status: true,
        store: true,
      },
    });

    if (!quotation) {
      this.logger.error('Quotation not found!');
      throw new NotFoundException('quotation not found!');
    }

    const message = await this.dbService.email_messages.findFirst({
      where: {
        is_active: true,
        email_type: MailType.QUOTATIONS,
        deleted_at: null,
      },
      orderBy: {
        created_at: 'desc',
      },
      select: {
        id: true,
        title: true,
        cc: true,
        bcc: true,
        greetings: true,
        welcome_header: true,
        footer: true,
        is_active: true,
        terms_detail: {
          where: {
            deleted_at: null,
          },
          select: {
            id: true,
            email_messages_id: true,
            terms: true,
          },
        },
        information_detail: {
          where: {
            deleted_at: null,
          },
          select: {
            id: true,
            email_messages_id: true,
            information: true,
          },
        },
        email_message_image: {
          where: {
            deleted_at: null,
          },
        },
      },
    });
    if (!message) {
      this.logger.error('Message not found!');
      throw new NotFoundException('message not found!');
    }

    // Convert email message images to base64 for PDF rendering
    // html-pdf (PhantomJS) cannot reliably load external HTTPS URLs
    const mailsImageDir = resolveUploadPath('mails-image');
    const headerImage = message.email_message_image?.find((img) => img.type === 1);
    const footerImage = message.email_message_image?.find((img) => img.type === 2);

    const headerImageBase64 = headerImage
      ? this.pdfService.getImageAsBase64(join(mailsImageDir, headerImage.path))
      : null;
    const footerImageBase64 = footerImage
      ? this.pdfService.getImageAsBase64(join(mailsImageDir, footerImage.path))
      : null;

    const mitra10LogoBase64 = this.pdfService.getImageAsBase64(
      join(process.cwd(), 'templates', 'public', 'img', 'logo-mitra.png'),
    );

    const data = {
      quotation,
      order: quotation.order,
      apiUrl: this.configService.get<string>('API_URL'),
      message,
      headerImageBase64,
      footerImageBase64,
      mitra10LogoBase64,
    };

    const buffer = await this.pdfService.generatePotrait('quotation-pdf', data);
    res.setHeader('Content-Type', 'application/pdf');
    const customerName =
      quotation.order?.members?.full_name?.replace(/[^a-zA-Z0-9 ]/g, '') ??
      'Customer';
    const quotationFilename = `Quotation - ${customerName} - Order ID : ${quotation.order_id}.pdf`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${quotationFilename}"`,
    );
    res.send(buffer);
  }
}
