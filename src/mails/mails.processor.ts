/* eslint-disable prettier/prettier */
import { Logger, NotFoundException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { PrismaService } from 'src/prisma/prisma.service';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { MailType } from './enum/mail_type.enum';
import { OrderMailInterface } from 'src/common/interface/mails/order-mail-interface';
import { DefaultDataMailInterface } from '../common/interface/mails/default-data-mail-interface';
import { QuotationMailInterface } from 'src/common/interface/mails/quotation-mail-interface';
import { CsiMailInterface } from '../common/interface/mails/csi-mail-interface';
import { RescheduleMailInterface } from '../common/interface/mails/reschedule-mail-interface';
import { RefundMailInterface } from '../common/interface/mails/refund-mail-interface';
import { ComplaintMailInterface } from '../common/interface/mails/complaint-mail-interface';
import { ReplaceTukangFromVendor } from 'src/common/interface/mails/replace-tukang-from-vendor.interface';

@Processor('email')
export class EmailProcessor {
  constructor(
    private readonly mailerService: MailerService,
    private readonly dbService: PrismaService,
    private configService: ConfigService,
  ) { }
  private readonly logger = new Logger(EmailProcessor.name);

  private async getMessage(mailType: MailType, id?: number) {
    return await this.dbService.email_messages.findFirst({
      where: {
        id: id ?? undefined,
        is_active: true,
        email_type: mailType,
        deleted_at: null,
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
          select: {
            id: true,
            email_message_id: true,
            type: true,
            path: true,
          },
        },
      },
    });
  }

  @Process('send-order-mail')
  async sendOrderMail(job: Job<OrderMailInterface>) {
    const { module_id, template_id } = job.data;
    try {
      if (!module_id) throw new NotFoundException('order_id is null!');

      const order = await this.dbService.orders.findFirst({
        where: {
          id: module_id,
          deleted_at: null,
          deleted_by: null,
        },
        select: {
          id: true,
          project_status_id: true,
          payment_type: true,
          project_address: true,
          project_number: true,
          receipt_number: true,
          request_survey: true,
          grand_total: true,
          created_at: true,
          work_orders: {
            select: {
              id: true,
              work_order_tukang: {
                include: {
                  tukang: true,
                },
              },
            },
          },
          store: {
            select: {
              email: true,
              bank_account: true,
              bank_name: true,
              bank_number: true,
              phone_number_1: true,
              phone_number_2: true,
            },
          },
          status: {
            select: {
              id: true,
              description: true,
              category: true,
            },
          },
          members: {
            select: {
              email: true,
              full_name: true,
            },
          },
          m_order_details: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              item_code: true,
              item_name: true,
              item_id: true,
              item: {
                select: {
                  id: true,
                  item_name: true,
                  category: true,
                  prices: true,
                  default_price: true,
                  service_name: true,
                },
              },
              item_notes: true,
              unit_price: true,
              quantity: true,
              total: true,
            },
          },
          quotation: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            include: {
              promotion: true,
              quotation_details: {
                include: {
                  item: true,
                },
              },
            },
          },
          order_files: true,
        },
      });

      if (!order) throw new NotFoundException(`Order with id ${module_id} not found!`);

      order['order_details'] = order.m_order_details;
      delete order.m_order_details;

      const recipientEmail = order.members?.email;
      if (!recipientEmail) {
        this.logger.warn(`Order #${order.id} has no member email. Skipping sending.`);
        return;
      }

      let message: any = null;
      if (template_id) {
        message = await this.getMessage(MailType.ORDER, template_id);
      }
      if (!message && order.project_status_id) {
        message = await this.dbService.email_messages.findFirst({
          where: {
            email_type: MailType.ORDER,
            trigger_id: order.project_status_id,
            is_active: true,
            deleted_at: null,
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
              where: { deleted_at: null },
              select: { id: true, email_messages_id: true, terms: true },
            },
            information_detail: {
              where: { deleted_at: null },
              select: { id: true, email_messages_id: true, information: true },
            },
            email_message_image: {
              where: { deleted_at: null },
              select: { id: true, email_message_id: true, type: true, path: true },
            },
          },
        });
      }
      if (!message) {
        message = await this.getMessage(MailType.ORDER);
      }
      if (!message) {
        message = {
          id: 0,
          title: `Update Pesanan #${order.id} - Mitra10`,
          welcome_header: 'Halo',
          greetings: 'Berikut adalah rincian pesanan Anda',
          footer: 'Terima kasih telah mempercayai Mitra10',
          terms_detail: [],
          information_detail: [],
          email_message_image: [],
          cc: '',
          bcc: '',
          is_active: true,
        };
      }

      const data = {
        order,
        message,
        apiUrl: this.configService.get<string>('API_URL'),
      };

      const bcc = message.bcc;
      const storeMail = order.store?.email || '';
      const adminHo = '';
      const mailBccList = this.configService.get<string>('MAIL_BCC_LIST') || '';

      const defaultBcc = [
        ...(bcc ? bcc.split(',') : []),
        ...(mailBccList ? mailBccList.split(',') : []),
        storeMail,
        adminHo,
      ]
        .map((email) => email && email.trim())
        .filter((email) => Boolean(email));

      const uniqueBcc = [...new Set(defaultBcc)];
      const from = this.configService.get<string>('MAIL_DEFAULTS') || 'instalasi@mitra10.com';

      const mailOptions = {
        to: recipientEmail,
        from,
        subject: message.title || `Pesanan Mitra10 #${order.id}`,
        template: 'index',
        bcc: uniqueBcc.length > 0 ? uniqueBcc.join(',') : '',
        context: { data },
      };

      await this.mailerService.sendMail(mailOptions);

      await this.maillogs(
        module_id,
        message.id || null,
        {
          to: recipientEmail,
          cc: '',
          bcc: mailOptions.bcc,
        },
        1,
        data,
      );
      this.logger.log(`Order email sent for order ${module_id} to ${recipientEmail}`);
    } catch (error) {
      this.logger.error(`Error sending order email for order ${module_id}: ${error.message}`, error.stack);
      await this.maillogs(
        module_id || null,
        template_id || null,
        { to: 'unknown', cc: '', bcc: '' },
        0,
        { error: error?.message || 'Failed to send order mail', data: job.data },
      );
      throw error;
    }
  }

  @Process('send-credential-mail')
  async sendCredentialMail(
    job: Job<{
      username: string;
      password: string;
      email?: string;
      to?: string;
      name?: string;
      user_id?: number;
    }>,
  ) {
    try {
      const { username, password } = job.data;
      if (!username) {
        throw new NotFoundException('Username is required for credential mail');
      }

      const user = await this.dbService.users.findFirst({
        where: {
          username: username,
          deleted_at: null,
          deleted_by: null,
        },
        include: {
          employee: true,
          pic_vendor: true,
          sales: true,
          tukang: true,
          store: true,
        },
      });

      let to = job.data.to || job.data.email;
      if (!to && user) {
        if (user.username && user.username.includes('@')) {
          to = user.username;
        } else if (user.employee?.email) {
          to = user.employee.email;
        } else if (user.pic_vendor && user.pic_vendor.length > 0 && user.pic_vendor[0].email_address) {
          to = user.pic_vendor[0].email_address;
        } else if (user.tukang && user.tukang.length > 0 && user.tukang[0].email) {
          to = user.tukang[0].email;
        } else if (user.store && user.store.length > 0 && user.store[0].email) {
          to = user.store[0].email;
        }
      }

      if (!to && username.includes('@')) {
        to = username;
      }

      if (!to) {
        this.logger.warn(`Recipient email for user ${username} not found. Skipping credential mail.`);
        return;
      }

      const data = {
        username,
        password,
      };

      const from = this.configService.get<string>('MAIL_DEFAULTS') || 'instalasi@mitra10.com';

      await this.mailerService.sendMail({
        to,
        from,
        subject: 'Informasi Akun Kredensial - Mitra10',
        template: 'credential-mail',
        context: { data },
      });

      await this.maillogs(
        user?.id ?? job.data.user_id ?? null,
        null,
        { to, cc: '', bcc: '' },
        1,
        data,
      );
      this.logger.log(`Credential mail successfully sent to ${to} for username ${username}`);
    } catch (error) {
      this.logger.error(`Failed to send credential mail: ${error.message}`, error.stack);
      await this.maillogs(
        job.data?.user_id || null,
        null,
        { to: job.data?.to || job.data?.email || job.data?.username || 'unknown', cc: '', bcc: '' },
        0,
        { error: error?.message || 'Failed to send credential mail', data: job.data },
      );
      throw error;
    }
  }

  @Process('send-reset-password-mail')
  async sendMailResetPassword(job: Job<DefaultDataMailInterface>) {
    const user_id = (job.data as any)?.user_id || job.data?.module_id;
    try {
      if (!user_id) throw new NotFoundException('user_id is missing!');

      const users = await this.dbService.users.findFirst({
        where: {
          id: user_id,
          deleted_at: null,
          deleted_by: null,
        },
        include: {
          employee: true,
          pic_vendor: true,
          sales: true,
          tukang: true,
        },
      });
      if (!users) throw new NotFoundException(`User with id ${user_id} not found!`);

      let message = await this.getMessage(MailType.CREDENTIALS);
      if (!message) {
        message = {
          id: 0,
          title: 'Reset Password Akun Mitra10',
          welcome_header: 'Hi,',
          greetings: 'Berikut adalah tautan reset password Anda',
          footer: 'Terima kasih',
          terms_detail: [],
          information_detail: [],
          email_message_image: [],
          cc: '',
          bcc: '',
          is_active: true,
        } as any;
      }

      const to = users.username?.includes('@')
        ? users.username
        : users.employee?.email ??
          users.pic_vendor?.[0]?.email_address ??
          users.tukang?.[0]?.email ??
          null;

      if (!to) {
        throw new NotFoundException(`No email address found for user id ${user_id}!`);
      }

      const data = {
        users,
        message,
      };

      const from = this.configService.get<string>('MAIL_DEFAULTS') || 'instalasi@mitra10.com';

      await this.mailerService.sendMail({
        to,
        from,
        subject: message.title || 'Email Reset Password',
        template: 'reset-password',
        context: { data },
      });

      await this.maillogs(user_id, message.id || null, { to, cc: '', bcc: '' }, 1, data);
      this.logger.log(`Reset password mail successfully sent to ${to}`);
    } catch (error) {
      this.logger.error(`Error sending reset password mail: ${error.message}`, error.stack);
      await this.maillogs(
        user_id || null,
        null,
        { to: 'unknown', cc: '', bcc: '' },
        0,
        { error: error?.message || 'Failed to send reset password mail', data: job.data },
      );
      throw error;
    }
  }

  // ================================
  // VENDOR REGISTRATION EMAILS
  // ================================

  @Process('send-vendor-submitted-mail')
  async sendVendorSubmittedMail(job: Job<{
    registration_id?: number;
    to: string;
    company_name: string;
    email_address: string;
    pic_email: string;
    phone_number: string;
    pic_phone: string;
  }>) {
    try {
      const { registration_id, to, company_name, email_address, pic_email, phone_number, pic_phone } = job.data;
      const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'https://instalasi.mitra10.com';

      const data = {
        company_name,
        email_address,
        pic_email,
        phone_number,
        pic_phone,
        website_url: baseUrl,
      };

      await this.mailerService.sendMail({
        to,
        from: 'instalasi@mitra10.com',
        subject: 'Pendaftaran Vendor Diterima - Mitra10',
        template: 'vendor-submitted',
        context: { data },
      });

      await this.maillogs(registration_id || null, null, { to, cc: '', bcc: '' }, 1, data);
    } catch (error) {
      this.logger.error(error);
      if (job.data?.to) {
        await this.maillogs(job.data?.registration_id || null, null, { to: job.data.to, cc: '', bcc: '' }, 0, {
          error: error?.message || 'Failed to send mail',
        });
      }
    }
  }

  @Process('send-vendor-pitching-mail')
  async sendVendorPitchingMail(job: Job<{
    registration_id?: number;
    to: string;
    company_name: string;
  }>) {
    try {
      const { registration_id, to, company_name } = job.data;
      const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'https://instalasi.mitra10.com';

      const data = {
        company_name,
        website_url: baseUrl,
      };

      await this.mailerService.sendMail({
        to,
        from: 'instalasi@mitra10.com',
        subject: 'Pendaftaran Vendor Masuk Proses Pitching - Mitra10',
        template: 'vendor-pitching',
        context: { data },
      });

      await this.maillogs(registration_id || null, null, { to, cc: '', bcc: '' }, 1, data);
    } catch (error) {
      this.logger.error(error);
      if (job.data?.to) {
        await this.maillogs(job.data?.registration_id || null, null, { to: job.data.to, cc: '', bcc: '' }, 0, {
          error: error?.message || 'Failed to send mail',
        });
      }
    }
  }

  @Process('send-vendor-approval-mail')
  async sendVendorApprovalMail(job: Job<{
    registration_id?: number;
    to: string;
    company_name: string;
    token: string;
    expires_hours: number;
    username: string;
    password: string;
  }>) {
    try {
      const { registration_id, to, company_name, token, expires_hours, username, password } = job.data;

      const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'https://instalasi.mitra10.com';
      const loginUrl = `${baseUrl}/login`;

      const data = {
        company_name,
        token,
        expires_hours,
        username,
        password,
        website_url: baseUrl,
        login_url: loginUrl,
      };

      await this.mailerService.sendMail({
        to,
        from: 'instalasi@mitra10.com',
        subject: 'Pendaftaran Vendor Disetujui - Mitra10',
        template: 'vendor-approval',
        context: { data },
      });

      await this.maillogs(registration_id || null, null, { to, cc: '', bcc: '' }, 1, data);
    } catch (error) {
      this.logger.error(error);
      if (job.data?.to) {
        await this.maillogs(job.data?.registration_id || null, null, { to: job.data.to, cc: '', bcc: '' }, 0, {
          error: error?.message || 'Failed to send mail',
        });
      }
    }
  }

  @Process('send-registrant-account-mail')
  async sendRegistrantAccountMail(job: Job<{
    registration_id?: number;
    to: string;
    company_name: string;
    email_address: string;
    pic_email: string;
    phone_number: string;
    pic_phone: string;
    username: string;
    password: string;
  }>) {
    try {
      const {
        registration_id,
        to,
        company_name,
        email_address,
        pic_email,
        phone_number,
        pic_phone,
        username,
        password,
      } = job.data;

      const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'https://instalasi.mitra10.com';
      const loginUrl = `${baseUrl}/login`;

      const data = {
        company_name,
        email_address,
        pic_email,
        phone_number,
        pic_phone,
        username,
        password,
        website_url: baseUrl,
        login_url: loginUrl,
      };

      await this.mailerService.sendMail({
        to,
        from: 'instalasi@mitra10.com',
        subject: `Akun Mitra10 Vendor ${company_name} sudah aktif`,
        template: 'registrant-account',
        context: { data },
      });

      await this.maillogs(registration_id || null, null, { to, cc: '', bcc: '' }, 1, data);
    } catch (error) {
      this.logger.error(error);
      if (job.data?.to) {
        await this.maillogs(job.data?.registration_id || null, null, { to: job.data.to, cc: '', bcc: '' }, 0, {
          error: error?.message || 'Failed to send mail',
        });
      }
    }
  }

  @Process('send-vendor-rejection-mail')
  async sendVendorRejectionMail(job: Job<{
    registration_id?: number;
    to: string;
    company_name: string;
    rejection_reason?: string;
    reapply_date?: string;
  }>) {
    try {
      const { registration_id, to, company_name, rejection_reason, reapply_date } = job.data;
      
      const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'https://instalasi.mitra10.com';

      const data = {
        company_name,
        rejection_reason: rejection_reason || 'Belum memenuhi kriteria',
        reapply_date,
        website_url: baseUrl,
      };

      await this.mailerService.sendMail({
        to,
        from: 'instalasi@mitra10.com',
        subject: 'Pendaftaran Vendor Ditolak - Mitra10',
        template: 'vendor-rejection',
        context: { data },
      });

      await this.maillogs(registration_id || null, null, { to, cc: '', bcc: '' }, 1, data);
    } catch (error) {
      this.logger.error(error);
      if (job.data?.to) {
        await this.maillogs(job.data?.registration_id || null, null, { to: job.data.to, cc: '', bcc: '' }, 0, {
          error: error?.message || 'Failed to send mail',
        });
      }
    }
  }

  @Process('send-quotation-mail')
  async sendQuotationMail(job: Job<QuotationMailInterface>) {
    try {
      const { module_id, template_id } = job.data;

      if (!module_id) {
        console.error('quotation_id is null!');
        throw new NotFoundException('quotation_id is null!');
      }

      const quotation = await this.dbService.quotation.findFirst({
        where: {
          id: module_id,
          deleted_at: null,
          order: {
            deleted_at: null,
          },
        },
        include: {
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
          promotion: true,
          store: true,
        },
      });

      if (!quotation) {
        console.error('Quotation not found!');
        throw new NotFoundException('quotation not found!');
      }

      const message = await this.getMessage(MailType.QUOTATIONS, template_id);
      if (!message) {
        console.error('Message not found!');
        throw new NotFoundException('message not found!');
      }

      const data = {
        quotation,
        order: quotation.order,
        message,
        apiUrl: this.configService.get<string>('API_URL'),
      };

      const { bcc } = message;

      const storeMail = quotation.store.email;
      const adminHo = '';

      let defaultTo = quotation.order.members.email;
      if (quotation.order_id) {
        const checkOrder = await this.dbService.orders.findFirst({
          where: {
            id: quotation.order_id,
          },
          select: {
            members: {
              select: {
                email: true,
              },
            },
          },
        });

        if (checkOrder) {
          defaultTo = checkOrder.members.email;
        }
      }
      if (quotation.status.category === 'QUOTEOUT') {
        await this.dbService.quotation.update({
          where: {
            id: module_id,
          },
          data: {
            readiness: 2,
          },
        });
        ('QUOTEOUT readiness 2');
      } else if (quotation.status.category === 'QUOTEIN') {
        await this.dbService.quotation.update({
          where: {
            id: module_id,
          },
          data: {
            readiness: 4,
          },
        });
      }

      const defaultBcc = bcc
        ? bcc
          .split(',')
          .concat(
            this.configService.get<string>('MAIL_BCC_LIST').split(','),
            storeMail,
            adminHo,
          )
          .filter((email) => email && email.trim() !== '')
        : [];
      const uniqueBcc = [...new Set(defaultBcc)];

      if (quotation.order.members.email) {
        const mailOptions = {
          to: defaultTo,
          from: 'instalasi@mitra10.com',
          subject: message.title,
          template: 'quotation',
          bcc,
          context: { data },
        };

        if (uniqueBcc.length > 0) {
          mailOptions.bcc = uniqueBcc.join(',');
        } else {
          mailOptions.bcc = '';
        }

        await this.mailerService.sendMail(mailOptions);
        await this.maillogs(
          quotation.order_id,
          message.id,
          {
            to: quotation.order.members.email,
            cc: '',
            bcc: mailOptions.bcc,
          },
          1,
          data,
        );
      }
    } catch (error) {
      this.logger.error(error);
    }
  }

  @Process('send-quotation-payment-mail')
  async sendQuotationPaymentMail(job: Job<QuotationMailInterface>) {
    try {
      const { module_id, template_id } = job.data;

      if (!module_id) {
        console.error('quotation_id is null!');
        throw new NotFoundException('quotation_id is null!');
      }

      const quotation = await this.dbService.quotation.findFirst({
        where: {
          id: module_id,
          receipt_quotation: {
            not: null,
          },
          readiness: 2,
          deleted_at: null,
          order: {
            deleted_at: null,
          },
        },
        include: {
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
          promotion: true,
          store: true,
        },
      });

      if (!quotation) {
        console.error('Quotation not found!');
        throw new NotFoundException('quotation not found!');
      }

      const message = await this.getMessage(
        MailType.QUOTATION_PAYMENT,
        template_id,
      );
      if (!message) {
        console.error('Message not found!');
        throw new NotFoundException('message not found!');
      }

      const data = {
        quotation,
        order: quotation.order,
        message,
        apiUrl: this.configService.get<string>('API_URL'),
      };
      const { bcc } = message;

      const storeMail = quotation.store.email;
      const adminHo = '';

      let defaultTo = quotation.order.members.email;
      if (quotation.order_id) {
        const checkOrder = await this.dbService.orders.findFirst({
          where: {
            id: quotation.order_id,
          },
          select: {
            members: {
              select: {
                email: true,
              },
            },
          },
        });

        if (checkOrder) {
          defaultTo = checkOrder.members.email;
        }
      }

      const defaultBcc = bcc
        ? bcc
          .split(',')
          .concat(
            this.configService.get<string>('MAIL_BCC_LIST').split(','),
            storeMail,
            adminHo,
          )
          .filter((email) => email && email.trim() !== '')
        : [];
      const uniqueBcc = [...new Set(defaultBcc)];

      if (quotation.order.members.email) {
        const mailOptions = {
          to: defaultTo,
          from: 'instalasi@mitra10.com',
          subject: message.title,
          template: 'quotation',
          bcc,
          context: { data },
        };

        if (uniqueBcc.length > 0) {
          mailOptions.bcc = uniqueBcc.join(',');
        } else {
          mailOptions.bcc = '';
        }

        await this.mailerService.sendMail(mailOptions);
        this.maillogs(
          quotation.order_id,
          message.id,
          {
            to: quotation.order.members.email,
            cc: '',
            bcc: mailOptions.bcc,
          },
          1,
          data,
        );

        await this.dbService.quotation.update({
          where: {
            id: module_id,
          },
          data: {
            readiness: 3,
          },
        });
      }
    } catch (error) {
      this.logger.error(error);
    }
  }

  @Process('send-csi-mail')
  async sendcsimail(job: Job<CsiMailInterface>) {
    try {
      const { module_id, order_id, template_id } = job.data;

      const csi = await this.dbService.csi_template.findFirst({
        where: {
          id: module_id,
          deleted_at: null,
        },
      });

      const order = await this.dbService.orders.findFirst({
        where: {
          id: order_id,
        },
        include: {
          members: true,
          status: true,
        },
      });

      if (!csi) throw new NotFoundException('csi not found!');
      if (!order) throw new NotFoundException('order not found!');

      const message = await this.dbService.email_messages.findFirst({
        where: {
          id: template_id,
          email_type: MailType.CSI,
          is_active: true,
        },
        include: {
          information_detail: true,
          terms_detail: true,
          email_message_image: true,
        },
      });
      if (!message) throw new NotFoundException('message not found!');
      const data = {
        csi,
        order,
        message,
        apiUrl: this.configService.get<string>('API_URL'),
      };
      // const { bcc, cc } = message;
      // const vendor = tukang.vendor.email_address;
      // TODO: add admin ho as bcc too

      // const defaultBcc = bcc
      //   .split(',')
      //   .concat(
      //     this.configService.get<string>('MAIL_BCC_LIST').split(','),
      //   );

      //   console.log("BCC: ",bcc);
      //   console.log("DEFAULT BCC: ",defaultBcc);

      // const uniqueBcc = [...new Set(defaultBcc)];
      // add csi mail template here
      if (order.members.email) {
        await this.mailerService.sendMail({
          to: data.order.members.email, // list of receivers
          from: 'instalasi@mitra10.com', // sender address
          // bcc: uniqueBcc.join(','),
          subject: message.title, // Subject line
          template: 'csi',
          context: { data },
        });
      }
      await this.maillogs(
        order_id,
        message.id,
        {
          to: order.members.email,
          cc: '',
          bcc: '',
        },
        1,
        data,
      );
    } catch (error) {
      this.logger.error(error);
    }
  }

  @Process('send-replace-tukang-from-vendor')
  async sendReplaceTukangFromVendor(job: Job<ReplaceTukangFromVendor>) {
    try {
      const { module_id: id, template_id } = job.data;

      const tukang = await this.dbService.tukang.findFirst({
        where: {
          id,
        },
        include: {
          vendor: true,
        },
      });
      if (!tukang) throw new NotFoundException('Tukang not found!');

      const message = await this.getMessage(
        MailType.REPLACE_TUKANG_FROM_VENDOR,
        template_id,
      );

      if (!message) throw new NotFoundException('message not found!');

      const data = {
        tukang,
        message,
      };

      const { bcc } = message;
      const vendor = tukang.vendor.email_address;
      // TODO: add admin ho as bcc too
      const adminHo = '';

      const defaultBcc = bcc
        .split(',')
        .concat(
          this.configService.get<string>('MAIL_BCC_LIST').split(','),
          vendor,
          adminHo,
        );

      const uniqueBcc = [...new Set(defaultBcc)];

      if (tukang.email) {
        await this.mailerService.sendMail({
          to: data.tukang.email, // list of receivers
          from: data.tukang.vendor.email_address ?? 'instalasi@mitra10.com', // sender address
          bcc: uniqueBcc.join(','),
          subject: message.title, // Subject line
          template: 'replace-tukang-from-vendor',
          context: { data },
        });
      }
      await this.maillogs(
        id,
        message.id,
        {
          to: tukang.email,
          cc: '',
          bcc: uniqueBcc.join(','),
        },
        1,
        data,
      );
    } catch (error) {
      this.logger.error(error);
    }
  }

  @Process('send-replace-tukang-from-tukang')
  async sendReplaceTukangFromTukang(job: Job<ReplaceTukangFromVendor>) {
    try {
      const { module_id: id, template_id } = job.data;

      const users = await this.dbService.users.findFirst({
        where: {
          id,
        },
        include: {
          tukang: {
            include: {
              vendor: true,
            },
          },
        },
      });
      if (!users) throw new NotFoundException('Vendor not found!');

      const message = await this.getMessage(
        MailType.REPLACE_TUKANG_FROM_TUKANG,
        template_id,
      );

      if (!message) throw new NotFoundException('message not found!');

      const data = {
        users,
        message,
      };

      const { bcc } = message;

      // TODO: add admin ho as bcc too
      const adminHo = '';

      const defaultBcc = bcc
        .split(',')
        .concat(
          this.configService.get<string>('MAIL_BCC_LIST').split(','),
          users.tukang[0].email,
          adminHo,
        );

      const uniqueBcc = [...new Set(defaultBcc)];

      if (users.tukang[0].vendor.email_address) {
        await this.mailerService.sendMail({
          to: data.users.tukang[0].vendor.email_address, // list of receivers
          from: data.users.tukang[0].email ?? 'instalasi@mitra10.com', // sender address
          bcc: uniqueBcc.join(','),
          subject: message.title, // Subject line
          template: 'replace-tukang-from-tukang',
          context: { data },
        });
      }
      await this.maillogs(
        id,
        message.id,
        {
          to: users.tukang[0].email,
          cc: '',
          bcc: uniqueBcc.join(','),
        },
        1,
        data,
      );
    } catch (error) {
      console.error('[sendReplaceTukangFromTukang] Error:', error);
      this.logger.error(error);
    }
  }

  @Process('send-reschedule-mail')
  async sendRescheduleMail(job: Job<RescheduleMailInterface>) {
    const { module_id: reschedule_id, template_id } = job.data;
    try {
      if (!reschedule_id) throw new NotFoundException('reschedule_id is null!');

      const reschedule = await this.dbService.reschedule.findFirst({
        where: {
          id: reschedule_id,
          order: {
            deleted_at: null,
          },
        },
        include: {
          reschedule_status: {
            where: {
              deleted_at: null,
            },
            orderBy: {
              created_at: 'desc',
            },
          },
          order: {
            include: {
              store: true,
              members: true,
              m_order_details: {
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
            },
          },
        },
      });

      if (!reschedule) throw new NotFoundException('Reschedule not found!');
      if (!reschedule.order)
        throw new NotFoundException('Reschedule not found!');
      if (!reschedule.order.m_order_details)
        throw new NotFoundException('Reschedule not found!');
      this.logger.log('Reschedule Data : ', reschedule.id);

      const message = await this.getMessage(MailType.RESCHEDULE, template_id);
      if (!message) throw new NotFoundException('message not found!');

      const data = {
        reschedule,
        order: reschedule.order_id,
        message,
      };

      const { bcc } = message;
      const storeMail = reschedule.order.store.email;
      // TODO: add admin ho as bcc too
      const adminHo = '';

      const defaultBcc = bcc
        ? bcc
          .split(',')
          .concat(
            this.configService.get<string>('MAIL_BCC_LIST').split(','),
            storeMail,
            adminHo,
          )
          .filter((email) => email && email.trim() !== '')
        : [];

      // if (order.status.category === 'WORKREQ' && order.work_orders.work_order_tukang) {
      //   const tukangEmail = order.work_orders.work_order_tukang.map(item => item?.tukang?.email || '').filter(email => email).join(', ');
      //   console.log(tukangEmail, "EMAIL TUKANG");

      //   if (tukangEmail) {
      //     defaultBcc = defaultBcc.concat(tukangEmail.split(',').map(email => email.trim()));
      //   }
      // }
      const uniqueBcc = [...new Set(defaultBcc)];

      const mailOptions = {
        to: data.reschedule.order.members.email, // list of receivers
        from: 'instalasi@mitra10.com', // sender address
        bcc,
        subject: message.title, // Subject line
        template: 'reschedule',
        context: { data },
      };

      if (uniqueBcc.length > 0) {
        mailOptions.bcc = uniqueBcc.join(',');
      } else {
        mailOptions.bcc = '';
      }

      if (reschedule.order.members.email) {
        await this.mailerService.sendMail(mailOptions);
      }

      await this.maillogs(
        reschedule.order_id,
        message.id,
        {
          to: reschedule.order.members.email,
          cc: '',
          bcc: mailOptions.bcc,
        },
        1,
        data,
      );
    } catch (error) {
      this.logger.error(error);
    }
  }

  @Process('send-refund-mail')
  async sendRefundMail(job: Job<RefundMailInterface>) {
    const { module_id: refund_id, template_id } = job.data;
    try {
      if (!refund_id) throw new NotFoundException('refund_id is null!');

      const refund = await this.dbService.refund.findFirst({
        where: {
          id: refund_id,
          orders: {
            deleted_at: null,
            deleted_by: null,
          },
        },
        include: {
          orders: {
            include: {
              store: true,
              members: true,
              m_order_details: {
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
            },
          },
        },
      });

      if (!refund || !refund.orders || !refund.orders.m_order_details)
        throw new NotFoundException('refund not found!');
      this.logger.log('Refund Data : ', refund.id);

      const message = await this.getMessage(MailType.REFUND, template_id);
      if (!message) throw new NotFoundException('message not found!');

      const data = {
        refund,
        order: refund.order_id,
        message,
      };

      const { bcc } = message;
      const storeMail = refund.orders.store.email;
      // TODO: add admin ho as bcc too
      const adminHo = '';

      const defaultBcc = bcc
        ? bcc
          .split(',')
          .concat(
            this.configService.get<string>('MAIL_BCC_LIST').split(','),
            storeMail,
            adminHo,
          )
          .filter((email) => email && email.trim() !== '')
        : [];

      // if (order.status.category === 'WORKREQ' && order.work_orders.work_order_tukang) {
      //   const tukangEmail = order.work_orders.work_order_tukang.map(item => item?.tukang?.email || '').filter(email => email).join(', ');
      //   console.log(tukangEmail, "EMAIL TUKANG");

      //   if (tukangEmail) {
      //     defaultBcc = defaultBcc.concat(tukangEmail.split(',').map(email => email.trim()));
      //   }
      // }
      const uniqueBcc = [...new Set(defaultBcc)];

      const mailOptions = {
        to: data.refund.orders.members.email, // list of receivers
        from: 'instalasi@mitra10.com', // sender address
        bcc,
        subject: message.title, // Subject line
        template: 'refund',
        context: { data },
      };

      if (uniqueBcc.length > 0) {
        mailOptions.bcc = uniqueBcc.join(',');
      } else {
        mailOptions.bcc = '';
      }

      if (refund.orders.members.email) {
        await this.mailerService.sendMail(mailOptions);
      }

      await this.maillogs(
        refund.order_id,
        message.id,
        {
          to: refund.orders.members.email,
          cc: '',
          bcc: mailOptions.bcc,
        },
        1,
        data,
      );
    } catch (error) {
      this.logger.error(error);
    }
  }

  @Process('send-complaint-mail')
  async sendComplaintMail(job: Job<ComplaintMailInterface>) {
    const { module_id: complaint_id, template_id } = job.data;
    try {
      if (!complaint_id) throw new NotFoundException('complaint_id is null!');

      const complaint = await this.dbService.complaints.findFirst({
        where: {
          id: complaint_id,
          orders: {
            deleted_at: null,
          },
          deleted_at: null,
        },
        include: {
          complaint_channels: true,
          orders: {
            include: {
              store: true,
              members: true,
              m_order_details: true,
            },
          },
        },
      });

      if (!complaint) throw new NotFoundException('Complaint not found!');
      this.logger.log('Complaint Data : ', complaint.id);

      const message = await this.getMessage(MailType.COMPLAINT, template_id);
      if (!message) throw new NotFoundException('message not found!');

      const data = {
        complaint,
        order: complaint.order_id,
        message,
      };

      const { bcc } = message;
      const storeMail = complaint.orders.store.email;
      // TODO: add admin ho as bcc too
      const adminHo = '';

      const defaultBcc = bcc
        ? bcc
          .split(',')
          .concat(
            this.configService.get<string>('MAIL_BCC_LIST').split(','),
            storeMail,
            adminHo,
          )
          .filter((email) => email && email.trim() !== '')
        : [];

      // if (order.status.category === 'WORKREQ' && order.work_orders.work_order_tukang) {
      //   const tukangEmail = order.work_orders.work_order_tukang.map(item => item?.tukang?.email || '').filter(email => email).join(', ');
      //   console.log(tukangEmail, "EMAIL TUKANG");

      //   if (tukangEmail) {
      //     defaultBcc = defaultBcc.concat(tukangEmail.split(',').map(email => email.trim()));
      //   }
      // }
      const uniqueBcc = [...new Set(defaultBcc)];

      const mailOptions = {
        to: data.complaint.orders.members.email, // list of receivers
        from: 'instalasi@mitra10.com', // sender address
        bcc,
        subject: message.title, // Subject line
        template: 'complaint',
        context: { data },
      };

      if (uniqueBcc.length > 0) {
        mailOptions.bcc = uniqueBcc.join(',');
      } else {
        mailOptions.bcc = '';
      }

      if (complaint.orders.members.email) {
        await this.mailerService.sendMail(mailOptions);
      }

      await this.maillogs(
        complaint.order_id,
        message.id,
        {
          to: complaint.orders.members.email,
          cc: '',
          bcc: uniqueBcc.join(','),
        },
        1,
        data,
      );
    } catch (error) {
      this.logger.error(error);
    }
  }

  async maillogs(
    moduleId: number | null,
    emailMessageId: number | null,
    to: { cc: string; bcc: string; to: string },
    status: number,
    data: any = null,
  ) {
    try {
      const mail_logs = await this.dbService.mail_logs.create({
        data: {
          moduleId: moduleId ?? null,
          emailMessageId: emailMessageId ?? null,
          to: to.to,
          status,
          data: data ? JSON.stringify(data) : null,
        },
      });

    } catch (error) {
      this.logger.error(error);
    }
  }
}
