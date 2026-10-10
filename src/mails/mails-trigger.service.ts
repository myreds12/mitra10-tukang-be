/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { JobOptions, Queue } from 'bull';
import { MailType } from './enum/mail_type.enum';
import { OrderMailInterface } from 'src/common/interface/mails/order-mail-interface';

@Injectable()
export class MailsTriggerService {
  private readonly logger = new Logger(MailsTriggerService.name);

  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async mailTriggerScheduler() {
    // Hanya instance 0 yang boleh menjalankan scheduler ini.
    // Di PM2 cluster mode, setiap instance mendapat NODE_APP_INSTANCE (0,1,2,...).
    // Instance lain tetap idle — mencegah N×duplikat job di Redis queue.
    const instanceId = process.env.NODE_APP_INSTANCE ?? '0';
    if (instanceId !== '0') return;

    try {
      this.logger.verbose('Initiate mail trigger checks');
      const mail_messages = await this.dbService.email_messages.findMany({
        where: {
          deleted_at: null,
          deleted_by: null,
          is_active: true,
        },
      });


      if (!mail_messages.length) {
        this.logger.verbose('No triggers found');
        return;
      }

      for (let index = 0; index < mail_messages.length; index++) {
        const template = mail_messages[index];
        if (template.trigger_id) {
          switch (template.email_type) {
            case MailType.ORDER:
              await this.handleOrderTriggers(template.id, template.trigger_id);
              break;

            case MailType.QUOTATIONS:
              await this.handleQuotationTriggers(
                template.id,
                template.trigger_id,
              );
              break;

            case MailType.REFUND:
              await this.handleRefundTriggers(template.id, template.trigger_id);
              break;

            case MailType.COMPLAINT:
              await this.handleComplaintTriggers(
                template.id,
                template.trigger_id,
              );
              break;

            case MailType.RESCHEDULE:
              await this.handleRescheduleTriggers(
                template.id,
                template.trigger_id,
              );
              break;

            case MailType.CSI:
              await this.handleCsiTriggers(template.id, template.trigger_id);
              break;

            case MailType.QUOTATION_PAYMENT:
              await this.handleQuotationPaymentTriggers(
                template.id,
                template.trigger_id,
              );
              break;

            default:
              break;
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  async handleOrderTriggers(template_id: number, status_id: number) {
    try {
      const orders = await this.dbService.orders.findMany({
        where: {
          project_status_id: status_id,
          m_order_details: {
            some: {},
          },
          deleted_at: null,
          deleted_by: null,
        },
        take: 100,
        orderBy: {
          created_at: 'desc',
        },
        select: { id: true },
      });

      if (!orders.length) {
        this.logger.verbose(`Order not found for status id ${status_id}`);
        return;
      }

      this.logger.log(
        `Order found for status id ${status_id} [${orders.length}]`,
      );

      const sentEmailLogs = await this.dbService.mail_logs.findMany({
        where: {
          moduleId: { in: orders.map((order) => order.id) },
          emailMessageId: template_id,
          status: 1,
        },
        select: { moduleId: true },
      });
      const sentEmailIds = new Set(sentEmailLogs.map((log) => log.moduleId));

      const jobs: {
        name?: string;
        data: OrderMailInterface;
        opts?: JobOptions;
      }[] = [];

      let delay = 5000;

      const jobPromises = orders.map(async (order) => {
        const jobId = `send-order-mail-${order.id}-${template_id}`;
        const jobExist = await this.emailQueue.getJob(jobId);

        if (!sentEmailIds.has(order.id) && !jobExist) {
          this.logger.log(
            `Scheduling email for order ${order.id} status ${status_id}`,
          );
          jobs.push({
            name: 'send-order-mail',
            data: {
              module_id: order.id,
              template_id,
            },
            opts: {
              jobId,
              delay,
            },
          });
          delay += 5000;
        }
      });

      await Promise.all(jobPromises);

      if (jobs.length > 0) {
        this.logger.verbose(`Jobs triggered [${jobs.length}]`);
        await this.emailQueue.addBulk(jobs);
      }
    } catch (error) {
      console.error(error);
      this.logger.error(
        `Error processing orders for template_id ${template_id}, status_id ${status_id}`,
      );
    }
  }

  async handleQuotationTriggers(template_id: number, status_id: number) {
    // this.logger.log(
    //   `[QuotationTrigger] Starting process for template_id=${template_id}, status_id=${status_id}`,
    // );

    try {
      const quotations = await this.dbService.quotation.findMany({
        where: {
          quotation_status: status_id,
          deleted_at: null,
          deleted_by: null,
        },
        take: 50,
        orderBy: {
          created_at: 'desc',
        },
      });

      // if (!quotations.length) {
      //   this.logger.verbose(
      //     `[QuotationTrigger] No quotations found for status_id=${status_id}`,
      //   );
      //   return;
      // }

      // this.logger.log(
      //   `[QuotationTrigger] Found ${quotations.length} quotations for status_id=${status_id}`,
      // );

      const jobs: { name?: string; data: object; opts?: JobOptions }[] = [];
      let delay = 2000;

      for (const quotation of quotations) {
        const countSendedEmail = await this.countMailLogs(
          quotation.order_id,
          template_id,
        );

        const jobId = `send-quotation-mail-${quotation.id}-${template_id}`;
        const jobExist = await this.emailQueue.getJob(jobId);

        // this.logger.debug(
        //   `[QuotationTrigger] Quotation ${quotation.id}: countMailLogs=${countSendedEmail}, jobExist=${!!jobExist}`,
        // );

        if (countSendedEmail > 0) {
          this.logger.verbose(
            `[QuotationTrigger] Skipping quotation ${quotation.id}: already sent ${countSendedEmail} emails.`,
          );
          continue;
        }

        if (jobExist) {
          this.logger.verbose(
            `[QuotationTrigger] Skipping quotation ${quotation.id}: job already exists in queue.`,
          );
          continue;
        }

        // Jika memenuhi syarat => buat job baru
        const jobData = {
          module_id: quotation.id,
          template_id,
        };

        jobs.push({
          name: 'send-quotation-mail',
          data: jobData,
          opts: {
            jobId,
            delay,
          },
        });

        // this.logger.log(
        //   `[QuotationTrigger] Queued job for quotation ${quotation.id} with delay=${delay}ms`,
        // );

        delay += 5000;
      }

      // Kirim semua job ke Redis
      if (jobs.length > 0) {
        // this.logger.verbose(
        //   `[QuotationTrigger] Dispatching ${jobs.length} jobs to queue "email"`,
        // );

        const result = await this.emailQueue.addBulk(jobs);

        // this.logger.log(
        //   `[QuotationTrigger] Successfully added ${result.length} jobs to queue.`,
        // );

        // Detail job yang dikirim
        // result.forEach((job) => {
        //   this.logger.debug(
        //     `[QuotationTrigger] Added jobId=${job.id}, name=${job.name}`,
        //   );
        // });
      } else {
        // this.logger.verbose(`[QuotationTrigger] No new jobs to queue.`);
      }
    } catch (error) {
      this.logger.error(
        `[QuotationTrigger] Error processing quotations for template_id=${template_id}, status_id=${status_id}: ${error.message}`,
        error.stack,
      );
    }
  }

  async handleQuotationPaymentTriggers(template_id: number, status_id: number) {
    // console.log("QUOTATION PAYMENT SEND EMAIL")
    const quotations = await this.dbService.quotation.findMany({
      where: {
        quotation_status: status_id,
        receipt_quotation: {
          not: null,
        },
        readiness: 2,
        deleted_at: null,
        deleted_by: null,
      },
      take: 50,
      orderBy: {
        created_at: 'desc',
      },
    });

    if (quotations.length) {
      const jobs: { name?: string; data: object; opts?: JobOptions }[] = [];
      let delay = 2000;
      // console.log(template_id, 'TEMPLATE ID');

      for (let index = 0; index < quotations.length; index++) {
        const quotation = quotations[index];
        const countSendedEmail = await this.countMailLogs(
          quotation.order_id,
          template_id,
        );

        const jobId = `send-quotation-payment-mail-${quotation.id}-${template_id}`;
        const jobExist = await this.emailQueue.getJob(jobId);

        if (countSendedEmail > 2 && !jobExist) {
          // this.logger.log(
          //   `Sending email for quotation ${quotation.id} - ${template_id}`,
          // );
          const jobData = {
            module_id: quotation.id,
            template_id: template_id,
          };
          jobs.push({
            name: 'send-quotation-payment-mail',
            data: jobData,
            opts: {
              jobId,
              delay,
            },
          });
          delay += 5000;
        }
      }

      if (jobs.length > 0) {
        this.logger.verbose(
          `Jobs triggered [${jobs.length}] => ${JSON.stringify(jobs)}`,
        );
        await this.emailQueue.addBulk(jobs);
      }
    } else {
      this.logger.verbose(`Quotation not found for status id ${status_id}`);
    }
  }

  async handleComplaintTriggers(template_id: number, status_id: number) {
    const complaints = await this.dbService.complaints.findMany({
      where: {
        complaint_status: status_id,
        deleted_at: null,
        deleted_by: null,
      },
      take: 10,
      orderBy: {
        created_at: 'desc',
      },
    });

    if (complaints.length) {
      this.logger.log(
        `Complaint found for status id ${status_id} [${complaints.length}]`,
      );

      const jobs: { name?: string; data: object; opts?: JobOptions }[] = [];
      let delay = 5000;

      for (let index = 0; index < complaints.length; index++) {
        const complaint = complaints[index];
        const countSendedEmail = await this.dbService.mail_logs.count({
          where: {
            moduleId: complaint.order_id,
            emailMessageId: template_id,
            status: 1,
          },
        });
        const jobId = `send-complaint-mail-${complaint.id}-${template_id}`;
        const jobExist = await this.emailQueue.getJob(jobId);

        if (!countSendedEmail && !jobExist) {
          // this.logger.log(
          //   `Sending email for complaint ${complaint.id} status ${status_id}`,
          // );
          jobs.push({
            name: 'send-complaint-mail',
            data: {
              module_id: complaint.id,
              template_id,
            },
            opts: {
              jobId,
              delay,
            },
          });
          delay += 5000;
        }
      }

      if (jobs.length > 0) {
        this.logger.verbose(`Jobs triggered [${jobs.length}] => ${jobs}`);
        await this.emailQueue.addBulk(jobs);
      }
    } else {
      this.logger.verbose(`Complaint not found for status id ${status_id}`);
    }
  }

  async handleRescheduleTriggers(template_id: number, status_id: number) {
    const reschedules = await this.dbService.reschedule.findMany({
      where: {
        status_id: status_id,
        deleted_at: null,
        deleted_by: null,
      },
    });

    if (reschedules.length) {
      this.logger.log(
        `Reschedule found for status id ${status_id} [${reschedules.length}]`,
      );

      const jobs: { name?: string; data: object; opts?: JobOptions }[] = [];
      let delay = 5000;

      for (let index = 0; index < reschedules.length; index++) {
        const reschedule = reschedules[index];
        const countSendedEmail = await this.dbService.mail_logs.count({
          where: {
            moduleId: reschedule.id,
            emailMessageId: template_id,
            status: 1,
          },
        });
        const jobId = `send-reschedule-mail-${reschedule.id}-${template_id}`;
        const jobExist = await this.emailQueue.getJob(jobId);

        if (!countSendedEmail && !jobExist) {
          // this.logger.log(
          //   `Sending email for reschedule ${reschedule.id} status ${status_id}`,
          // );
          jobs.push({
            name: 'send-reschedule-mail',
            data: {
              module_id: reschedule.id,
              template_id,
            },
            opts: {
              jobId,
              delay,
            },
          });
          delay += 5000;
        }
      }

      if (jobs.length > 0) {
        this.logger.verbose(`Jobs triggered [${jobs.length}] => ${jobs}`);
        await this.emailQueue.addBulk(jobs);
      }
    } else {
      this.logger.verbose(`Reschedule not found for status id ${status_id}`);
    }
  }

  async handleRefundTriggers(template_id: number, status_id: number) {
    const refunds = await this.dbService.refund.findMany({
      where: {
        refund_status: status_id,
        deleted_at: null,
        deleted_by: null,
      },
      take: 10,
      orderBy: {
        created_at: 'desc',
      },
    });

    if (refunds.length) {
      this.logger.log(
        `Refund found for status id ${status_id} [${refunds.length}]`,
      );

      const jobs: { name?: string; data: object; opts?: JobOptions }[] = [];
      let delay = 5000;

      for (let index = 0; index < refunds.length; index++) {
        const refund = refunds[index];
        const countSendedEmail = await this.dbService.mail_logs.count({
          where: {
            moduleId: refund.id,
            emailMessageId: template_id,
            status: 1,
          },
        });
        const jobId = `send-refund-mail-${refund.id}-${template_id}`;
        const jobExist = await this.emailQueue.getJob(jobId);

        if (!countSendedEmail && !jobExist) {
          // this.logger.log(
          //   `Sending email for refund ${refund.id} status ${status_id}`,
          // );
          jobs.push({
            name: 'send-refund-mail',
            data: {
              module_id: refund.id,
              template_id,
            },
            opts: {
              jobId,
              delay,
            },
          });
          delay += 5000;
        }
      }

      if (jobs.length > 0) {
        this.logger.verbose(`Jobs triggered [${jobs.length}] => ${jobs}`);
        await this.emailQueue.addBulk(jobs);
      }
    } else {
      this.logger.verbose(`Refund not found for status id ${status_id}`);
    }
  }

  async handleCsiTriggers(template_id: number, status_id: number) {

    const orders = await this.dbService.orders.findMany({
      where: {
        project_status_id: status_id,
        deleted_at: null,
        deleted_by: null,
      },
      take: 50,
      orderBy: {
        created_at: 'desc',
      },
    });


    const csi = await this.dbService.csi_template.findFirst({
      where: {
        active: true,
        deleted_at: null,
      },
    });

    if (orders.length) {
      this.logger.log(
        `CSI found for status id ${status_id} [${orders.length}]`,
      );

      const jobs: { name?: string; data: object; opts?: JobOptions }[] = [];
      let delay = 5000;

      for (let index = 0; index < orders.length; index++) {
        const order = orders[index];
        const countSendedEmail = await this.dbService.mail_logs.count({
          where: {
            moduleId: order.id,
            emailMessageId: template_id,
            status: 1,
          },
        });
        const jobId = `send-csi-mail-${order.id}-${template_id}`;
        const jobExist = await this.emailQueue.getJob(jobId);

        // Guard dedup: skip jika sudah pernah dikirim atau job sudah ada di queue
        if (!countSendedEmail && !jobExist) {
          jobs.push({
            name: 'send-csi-mail',
            data: {
              module_id: csi.id,
              order_id: order.id,
              template_id,
            },
            opts: {
              jobId,
              delay,
            },
          });
          delay += 5000;
        }
      }

      if (jobs.length > 0) {
        this.logger.verbose(`Jobs triggered [${jobs.length}] => ${jobs}`);
        await this.emailQueue.addBulk(jobs);
      }
    } else {
      this.logger.verbose(`Refund not found for status id ${status_id}`);
    }
  }

  async removeHistory(id: number) {
    const emailMessage = await this.dbService.mail_logs.delete({
      where: {
        id,
      },
    });

    return emailMessage;
  }

  private async countMailLogs(moduleId: number, template_id: number) {
    return await this.dbService.mail_logs.count({
      where: {
        moduleId,
        emailMessageId: template_id,
        status: 1,
      },
    });
  }

  // ================================
  // TEST SEND EMAIL (DIAGNOSTIC & TRACING)
  // ================================

}
