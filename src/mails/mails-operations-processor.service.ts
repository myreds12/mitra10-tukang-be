/* eslint-disable prettier/prettier */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import { MailType } from './enum/mail_type.enum';
import { CsiMailInterface } from '../common/interface/mails/csi-mail-interface';
import { RescheduleMailInterface } from '../common/interface/mails/reschedule-mail-interface';
import { RefundMailInterface } from '../common/interface/mails/refund-mail-interface';
import { ComplaintMailInterface } from '../common/interface/mails/complaint-mail-interface';
import { ReplaceTukangFromVendor } from 'src/common/interface/mails/replace-tukang-from-vendor.interface';

@Injectable()
export class MailsOperationsProcessorService {
  private readonly logger = new Logger(MailsOperationsProcessorService.name);

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
        subject: 'Notifikasi Pendaftaran Vendor Instalasi Mitra10',
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
        subject: 'Notifikasi Vendor Resmi Terdaftar sebagai Mitra Mitra10',
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
        subject: 'Notifikasi Pendaftaran Vendor Instalasi Mitra10',
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
        rejection_reason: rejection_reason || 'Belum memenuhi kriteria yang ditetapkan oleh Mitra10.',
        reapply_date,
        website_url: baseUrl,
      };

      await this.mailerService.sendMail({
        to,
        from: 'instalasi@mitra10.com',
        subject: 'Notifikasi Penolakan Pendaftaran Vendor Mitra10',
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


}
