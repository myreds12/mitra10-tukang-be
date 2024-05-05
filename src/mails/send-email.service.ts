import { Injectable, NotFoundException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { OrderService } from 'src/order/order.service';
import * as pug from 'pug';
import { PrismaService } from 'src/prisma/prisma.service';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SendEmailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly orderService: OrderService,
    private readonly dbService: PrismaService,
    private configService: ConfigService,
  ) {}

  async generatePDF(data: any) {}

  async sendMail(order_id: number) {
    const order = await this.orderService.findOne(order_id);

    const message = await this.dbService.email_messages.findFirst({
      where: {
        is_active: true,
        email_type: 1,
      },
      include: {
        terms_detail: true,
        information_detail: true,
      },
    });

    const data = {
      order,
      message,
    };

    console.log('Email Order Data : ');
    console.log(data.order, data.message);

    const storeMail = order.store.email;
    // TODO: add admin ho as cc too
    const adminHo = '';

    const bccList = this.configService
      .get<string>('MAIL_BCC_LIST')
      .split(',');

    if (!bccList.includes(storeMail)) {
      bccList.push(storeMail);
    }

    await this.mailerService.sendMail({
      to: data.order.members.email, // list of receivers
      from: 'noreply@mitra10.com', // sender address
      bcc: bccList.join(','),
      subject: 'Email Order', // Subject line
      template: 'index',
      context: { data },
      // html: pug.renderFile('templates/index.pug', { data }),
      // attachments: [
      //   {
      //     filename: 'order.pdf',
      //     content: generatePdf,
      //     encoding: 'base64',
      //     cid: 'noreply@mitra10.com', // Ganti dengan CID yang unik
      //   },
      // ],
    });
  }

  async sendMailResetPassword(user_id: number) {
    const users = await this.dbService.users.findFirst({
      where: {
        id: user_id,
      },
      include: {
        employee: true,
        vendor: true,
        sales: true,
        tukang: true,
      },
    });

    const message = await this.dbService.email_messages.findFirst({
      where: {
        is_active: true,
        email_type: 3,
      },
      include: {
        terms_detail: true,
        information_detail: true,
      },
    });

    let to = users.username.includes('@')
      ? users.username
      : users.employee?.email ??
        users.vendor?.email_address ??
        users.tukang[0]?.email ??
        'example@example.com';
    console.log(to);
    const data = {
      users,
      message,
    };

    await this.mailerService.sendMail({
      to,
      // from: 'noreply@mitra10.com', // sender address
      subject: 'Email Reset Password', // Subject line
      template: 'reset-password',
      context: { data },
      // html: pug.renderFile('templates/reset-password.pug', { data }),
    });
  }

  async sendCredentialMail(username: string, password: string) {
    const data = {
      username,
      password,
    };
    const users = await this.dbService.users.findFirst({
      where: {
        username,
      },
      include: {
        employee: true,
        vendor: true,
        sales: true,
        tukang: true,
      },
    });
    if (!users) throw new NotFoundException('User  not found!');

    const userEmail = users.username.includes('@') ? users.username : null;
    const to =
      userEmail ||
      users.employee?.email ||
      users.vendor?.email_address ||
      users.tukang[0]?.email ||
      'example@example.com';

    await this.mailerService.sendMail({
      to,
      // from: 'noreply@mitra10.com', // sender address
      subject: 'Credential Mail', // Subject line
      template: 'credential-mail',
      context: { data },
      // html: pug.renderFile('templates/credential-mail.pug', { data }),
    });
  }

  async sendQuotationMail(quotation_id: number) {
    const quotation = await this.dbService.quotation.findFirst({
      where: {
        id: quotation_id,
        deleted_at: null,
      },
      include: {
        quotation_files: true,
        quotation_details: {
          include: {
            category: true,
          },
        },
        order: {
          include: {
            m_order_details: true,
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

    const message = await this.dbService.email_messages.findFirst({
      where: {
        email_type: 4,
        is_active: true,
      },
      include: {
        information_detail: true,
        terms_detail: true,
      },
    });

    const data = {
      quotation,
      message,
    };

    const storeMail = quotation.store.email;
    // TODO: add admin ho as cc too
    const adminHo = '';

    const bccList = this.configService
      .get<string>('MAIL_BCC_LIST')
      .split(',');

    if (!bccList.includes(storeMail)) {
      bccList.push(storeMail);
    }

    await this.mailerService.sendMail({
      to: data.quotation.order.members.email, // list of receivers
      bcc: bccList.join(','),
      from: 'noreply@mitra10.com', // sender address
      subject: 'Email Quotation', // Subject line
      template: 'quotation',
      context: { data },
    });
  }
}
