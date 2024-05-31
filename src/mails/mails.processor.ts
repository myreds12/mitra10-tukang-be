import { Logger, NotFoundException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { PrismaService } from 'src/prisma/prisma.service';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
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

@Processor('email')
export class EmailProcessor {
  constructor(
    private readonly mailerService: MailerService,
    private readonly dbService: PrismaService,
    private configService: ConfigService,
  ) { }
  private readonly logger = new Logger(EmailProcessor.name);

  @OnQueueFailed()
  private async handleJobFailure(
    job: Job<DefaultDataMailInterface>,
    error: any,
  ) {
    this.logger.error(error.message);
    await this.maillogs(
      job.data?.module_id ?? 0,
      job.data?.template_id ?? 0,
      { to: '', cc: '', bcc: '' },
      0,
      JSON.stringify(error),
    );
  }

  private async getMessage(mailType: MailType, id?: number) {
    return await this.dbService.email_messages.findFirst({
      where: {
        id: id ?? undefined,
        is_active: true,
        email_type: mailType,
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
          select: {
            id: true,
            email_messages_id: true,
            terms: true,
          },
        },
        information_detail: {
          select: {
            id: true,
            email_messages_id: true,
            information: true,
          },
        },
      },
    });
  }

  async generatePDF(data: any) { }

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
          payment_type: true,
          project_address: true,
          project_number: true,
          receipt_number: true,
          request_survey: true,
          work_orders: {
            select: {
              id: true,
              work_order_tukang: {
                include: {
                  tukang: true
                }
              }
            }
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
            }
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
        },
      });
      this.logger.log('Order: ', order);
      order['order_details'] = order.m_order_details;
      delete order.m_order_details;

      if (!order) throw new NotFoundException('order not found!');
      this.logger.log('Order Data : ', order.id);

      const message = await this.getMessage(MailType.ORDER, template_id);
      if (!message) throw new NotFoundException('message not found!');

      const data = {
        order,
        message,
      };

      const { bcc, cc } = message;
      const storeMail = order.store.email;
      // TODO: add admin ho as bcc too
      const adminHo = '';

      let defaultBcc = bcc
        .split(',')
        .concat(
          this.configService.get<string>('MAIL_BCC_LIST').split(','),
          storeMail,
          adminHo,
        ).filter(email => email);

      if (order.status.category === 'WORKREQ' && order.work_orders.work_order_tukang) {
        const tukangEmail = order.work_orders.work_order_tukang.map(item => item?.tukang?.email || '').filter(email => email).join(', ');
        console.log(tukangEmail, "EMAIL TUKANG");

        if (tukangEmail) {
          defaultBcc = defaultBcc.concat(tukangEmail.split(',').map(email => email.trim()));
        }
      }

      const uniqueBcc = [...new Set(defaultBcc)];



      if (order.members.email) {
        await this.mailerService.sendMail({
          to: data.order.members.email, // list of receivers
          from: 'noreply@mitra10.com', // sender address
          bcc: uniqueBcc.join(','),
          subject: message.title, // Subject line
          template: 'index',
          context: { data },
        });
      }

      await this.maillogs(
        module_id,
        message.id,
        {
          to: order.members.email,
          cc: '',
          bcc: uniqueBcc.join(','),
        },
        1,
        data,
      );
    } catch (error) {
      this.logger.error(job.data);
      this.logger.error(error);

      // try {
      //   if (error instanceof NotFoundException) {
      //
      //   } else if (error instanceof PrismaClientKnownRequestError) {
      //
      //   } else {
      //     this.logger.warn(`Retrys: ${job.attemptsMade}`);
      //     // job.retry();
      //   }
      // } catch (innerError) {
      //   this.logger.error(
      //     'An error occurred while handling the original error:',
      //     innerError,
      //   );
      // }
    }
  }

  @Process('send-reset-password-mail')
  async sendMailResetPassword(job: Job<DefaultDataMailInterface>) {
    try {
      const { module_id: user_id } = job.data;
      const users = await this.dbService.users.findFirst({
        where: {
          id: user_id,
          deleted_at: null,
          deleted_by: null,
        },
        include: {
          employee: true,
          vendor: true,
          sales: true,
          tukang: true,
        },
      });
      if (!users) throw new NotFoundException('User not found!');

      const message = await this.getMessage(MailType.CREDENTIALS);
      if (!message) throw new NotFoundException('message not found!');

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
        from: 'noreply@mitra10.com', // sender address
        subject: 'Email Reset Password', // Subject line
        template: 'reset-password',
        context: { data },
      });
    } catch (error) {
      this.logger.error(error);

      // try {
      //   if (error instanceof NotFoundException) {
      //   } else if (error instanceof PrismaClientKnownRequestError) {
      //
      //   } else {
      //     // job.retry();
      //   }
      // } catch (innerError) {
      //   this.logger.error(
      //     'An error occurred while handling the original error:s',
      //     innerError,
      //   );
      // }
    }
  }

  @Process('send-credential-mail')
  async sendCredentialMail(job: Job<{ username: string; password: string }>) {
    try {
      const { username, password } = job.data;
      const data = {
        username,
        password,
      };
      const users = await this.dbService.users.findFirst({
        where: {
          username,
          deleted_at: null,
        },
        include: {
          employee: true,
          vendor: true,
          store: true,
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
        users.store[0]?.email ||
        'example@example.com';

      await this.mailerService.sendMail({
        to,
        from: 'noreply@mitra10.com', // sender address
        subject: 'Credential Mail', // Subject line
        template: 'credential-mail',
        context: { data },
      });
    } catch (error) {
      this.logger.error(error);

      // try {
      //   if (error instanceof NotFoundException) {
      //
      //   } else if (error instanceof PrismaClientKnownRequestError) {
      //
      //   } else {
      //     // job.retry();
      //   }
      // } catch (innerError) {
      //   this.logger.error(
      //     'An error occurred while handling the original error:s',
      //     innerError,
      //   );
      // }
    }
  }

  @Process('send-quotation-mail')
  async sendQuotationMail(job: Job<QuotationMailInterface>) {
    try {
      const { module_id: id, template_id, to, orderId } = job.data;
      if (!id) throw new NotFoundException('quotation_id is null!');
      const quotation = await this.dbService.quotation.findFirst({
        where: {
          id: id,
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
          store: true,
        },
      });
      if (!quotation) throw new NotFoundException('quotation not found!');

      const message = await this.getMessage(MailType.QUOTATIONS, template_id);
      if (!message) throw new NotFoundException('message not found!');

      const data = {
        quotation,
        message,
      };
      const { bcc, cc } = message;

      const storeMail = quotation.store.email;
      // TODO: add admin ho as bcc too
      const adminHo = '';

      let defaultTo = quotation.order.members.email;
      if (to) {
        defaultTo = to;
      }
      if (orderId) {
        const checkOrder = await this.dbService.orders.findFirst({
          where: {
            id: orderId,
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
        .split(',')
        .concat(
          this.configService.get<string>('MAIL_BCC_LIST').split(','),
          storeMail,
          adminHo,
        );

      const uniqueBcc = [...new Set(defaultBcc)];

      if (quotation.order.members.email) {
        await this.mailerService.sendMail({
          to: defaultTo, // list of receivers
          bcc: uniqueBcc.join(','),
          from: 'noreply@mitra10.com', // sender address
          subject: 'Email Quotation', // Subject line
          template: 'quotation',
          context: { data },
        });
        this.maillogs(
          id,
          message.id,
          {
            to: quotation.order.members.email,
            cc: '',
            bcc: uniqueBcc.join(','),
          },
          1,
          data,
        );
      }
    } catch (error) {
      this.logger.error(error);
    }
  }

  @Process('send-csi-mail')
  async sendcsimail(job: Job<CsiMailInterface>) {
    try {
      const { module_id: csi_id } = job.data;
      const csi = await this.dbService.csi_template.findFirst({
        where: {
          id: csi_id,
          deleted_at: null,
        },
      });
      if (!csi) throw new NotFoundException('csi not found!');

      const message = await this.dbService.email_messages.findFirst({
        where: {
          email_type: MailType.CSI,
          is_active: true,
        },
        include: {
          information_detail: true,
          terms_detail: true,
        },
      });
      if (!message) throw new NotFoundException('message not found!');

      // add csi mail template here
    } catch (error) {
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
        message,
      };

      const { bcc, cc } = message;
      const storeMail = reschedule.order.store.email;
      // TODO: add admin ho as bcc too
      const adminHo = '';

      const defaultBcc = bcc
        .split(',')
        .concat(
          this.configService.get<string>('MAIL_BCC_LIST').split(','),
          storeMail,
          adminHo,
        );

      const uniqueBcc = [...new Set(defaultBcc)];

      if (reschedule.order.members.email) {
        await this.mailerService.sendMail({
          to: data.reschedule.order.members.email, // list of receivers
          from: 'noreply@mitra10.com', // sender address
          bcc: uniqueBcc.join(','),
          subject: message.title, // Subject line
          template: 'reschedule',
          context: { data },
        });
      }

      await this.maillogs(
        reschedule_id,
        message.id,
        {
          to: reschedule.order.members.email,
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
        message,
      };

      const { bcc, cc } = message;
      const storeMail = refund.orders.store.email;
      // TODO: add admin ho as bcc too
      const adminHo = '';

      const defaultBcc = bcc
        .split(',')
        .concat(
          this.configService.get<string>('MAIL_BCC_LIST').split(','),
          storeMail,
          adminHo,
        );

      const uniqueBcc = [...new Set(defaultBcc)];

      if (refund.orders.members.email) {
        await this.mailerService.sendMail({
          to: data.refund.orders.members.email, // list of receivers
          from: 'noreply@mitra10.com', // sender address
          bcc: uniqueBcc.join(','),
          subject: message.title, // Subject line
          template: 'refund',
          context: { data },
        });
      }

      await this.maillogs(
        refund_id,
        message.id,
        {
          to: refund.orders.members.email,
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

  @Process('send-complaint-mail')
  async sendComplaintMail(job: Job<ComplaintMailInterface>) {
    const { module_id: reschedule_id, template_id } = job.data;
    try {
      if (!reschedule_id) throw new NotFoundException('reschedule_id is null!');

      const complaint = await this.dbService.complaints.findFirst({
        where: {
          id: reschedule_id,
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
        message,
      };

      const { bcc, cc } = message;
      const storeMail = complaint.orders.store.email;
      // TODO: add admin ho as bcc too
      const adminHo = '';

      const defaultBcc = bcc
        .split(',')
        .concat(
          this.configService.get<string>('MAIL_BCC_LIST').split(','),
          storeMail,
          adminHo,
        );

      const uniqueBcc = [...new Set(defaultBcc)];

      if (complaint.orders.members.email) {
        await this.mailerService.sendMail({
          to: data.complaint.orders.members.email, // list of receivers
          from: 'noreply@mitra10.com', // sender address
          bcc: uniqueBcc.join(','),
          subject: message.title, // Subject line
          template: 'complaint',
          context: { data },
        });
      }

      await this.maillogs(
        reschedule_id,
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
    moduleId: number,
    emailMessageId: number,
    to: { cc: string; bcc: string; to: string },
    status: number,
    data: any = null,
  ) {
    await this.dbService.mail_logs.create({
      data: {
        emailMessages: {
          connect: {
            id: emailMessageId,
          },
        },
        moduleId,
        data: JSON.stringify(data ?? {}),
        to: JSON.stringify(to ?? {}),
        status,
      },
    });
  }
}
