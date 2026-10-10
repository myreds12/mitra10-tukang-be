/* eslint-disable prettier/prettier */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import { MailType } from './enum/mail_type.enum';
import { OrderMailInterface } from 'src/common/interface/mails/order-mail-interface';
import { DefaultDataMailInterface } from '../common/interface/mails/default-data-mail-interface';
import { QuotationMailInterface } from 'src/common/interface/mails/quotation-mail-interface';

@Injectable()
export class MailsOrderProcessorService {
  private readonly logger = new Logger(MailsOrderProcessorService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly dbService: PrismaService,
    private configService: ConfigService,
  ) {}

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


}
