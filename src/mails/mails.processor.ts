import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { OrderService } from 'src/order/order.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';

@Processor('email')
export class EmailProcessor {
  constructor(
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    private readonly mailerService: MailerService,
    private readonly dbService: PrismaService,
    private configService: ConfigService,
  ) {}
  private readonly logger = new Logger(EmailProcessor.name);

  async generatePDF(data: any) {}

  @Process('send-order-mail')
  async sendOrderMail(job: Job<{ order_id: number }>) {
    this.logger.log('Start sending email');
    try {
      const { order_id } = job.data;
      const order = await this.orderService.findOne(order_id);
      if (!order) throw new NotFoundException('order not found!');

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
      if (!message) throw new NotFoundException('message not found!');

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

      if (order.members.email) {
        await this.mailerService.sendMail({
          to: data.order.members.email, // list of receivers
          from: 'noreply@mitra10.com', // sender address
          bcc: bccList.join(','),
          subject: 'Email Order', // Subject line
          template: 'index',
          context: { data },
        });
      }

      job.finished();
      job.moveToCompleted();
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Log the error and stop the job without retrying
        console.error(error.message);
        job.moveToFailed({
          message: error.message,
        });
      } else {
        // Retry the job for other errors
        job.retry();
      }
    }
  }

  @Process('send-reset-password-mail')
  async sendMailResetPassword(job: Job<{ user_id: number }>) {
    try {
      const { user_id } = job.data;
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
      if (!users) throw new NotFoundException('User not found!');

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

      job.finished();
      job.moveToCompleted();
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Log the error and stop the job without retrying
        console.error(error.message);
        job.moveToFailed({
          message: error.message,
        });
      } else {
        // Retry the job for other errors
        job.retry();
      }
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

      job.finished();
      job.moveToCompleted();
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Log the error and stop the job without retrying
        console.error(error.message);
        job.moveToFailed({
          message: error.message,
        });
      } else {
        // Retry the job for other errors
        job.retry();
      }
    }
  }

  @Process('send-quotation-mail')
  async sendQuotationMail(job: Job<{ id: number }>) {
    const { id: quotation_id } = job.data;
    try {
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
      if (!quotation) throw new NotFoundException('quotation not found!');

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
      if (!message) throw new NotFoundException('message not found!');

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
      if (quotation.order.members.email) {
        await this.mailerService.sendMail({
          to: data.quotation.order.members.email, // list of receivers
          bcc: bccList.join(','),
          from: 'noreply@mitra10.com', // sender address
          subject: 'Email Quotation', // Subject line
          template: 'quotation',
          context: { data },
        });
      }

      job.finished();
      job.moveToCompleted();
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Log the error and stop the job without retrying
        console.error(error.message);
        job.moveToFailed({
          message: error.message,
        });
      } else {
        // Retry the job for other errors
        job.retry();
      }
    }
  }
}
