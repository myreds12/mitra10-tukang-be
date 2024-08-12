import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateEmailMessageDto } from './dto/create-email-message.dto';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateEmailMessageDto } from './dto/update-email-message.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailType } from './enum/mail_type.enum';
import { InjectQueue } from '@nestjs/bull';
import { JobOptions, Queue } from 'bull';
import { OrderMailInterface } from 'src/common/interface/mails/order-mail-interface';
import { QuotationMailInterface } from 'src/common/interface/mails';

@Injectable()
export class MailsService {
  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}

  private readonly logger = new Logger(MailsService.name);

  async create(createEmailMessageDto: CreateEmailMessageDto, user_id: number) {
    const termsDetail: Prisma.terms_detailCreateManyEmail_messagesInput[] =
      createEmailMessageDto.terms_detail.map((item) => {
        return {
          terms: item.term,
        };
      });

    const informationDetail: Prisma.information_detailCreateManyEmail_messagesInput[] =
      createEmailMessageDto.information_detail.map((item) => {
        return {
          information: item.information,
        };
      });

    const data: Prisma.email_messagesCreateInput = {
      email_type: createEmailMessageDto.email_type,
      greetings: createEmailMessageDto.greetings,
      welcome_header: createEmailMessageDto.welcome_header,
      footer: createEmailMessageDto.footer,
      created_by: user_id,
      terms_detail: {
        createMany: {
          data: termsDetail,
        },
      },
      information_detail: {
        createMany: {
          data: informationDetail,
        },
      },
      title: createEmailMessageDto?.title,
      trigger: createEmailMessageDto?.trigger_id
        ? {
            connect: {
              id: createEmailMessageDto.trigger_id,
            },
          }
        : undefined,
      bcc: createEmailMessageDto?.bcc
        .split(',')
        .map((s) => s.trim())
        .join(','),
      cc: createEmailMessageDto?.cc
        .split(',')
        .map((s) => s.trim())
        .join(','),
      csi_template: createEmailMessageDto?.csi_id
        ? {
            connect: {
              id: createEmailMessageDto.csi_id,
            },
          }
        : undefined,
    };

    const [emailMessage] = await this.dbService.$transaction([
      this.dbService.email_messages.create({
        data,
      }),
    ]);

    return emailMessage;
  }

  async findAll(query: QueryParamsDto) {
    const { type_email_message, page, take, order_by } = query;
    const where: Prisma.email_messagesWhereInput = {
      AND: [
        ...(type_email_message
          ? [
              {
                email_type: {
                  equals: Number(type_email_message),
                },
              },
            ]
          : []),
      ],
      deleted_at: null
    };
    const skip = page * take - take;
    const emailMessage = await this.dbService.email_messages.findMany({
      where,
      skip,
      take: take > 0 ? take : undefined,
      orderBy: {
        created_at: order_by,
      },
      include: {
        terms_detail: {
          where: {
            deleted_at: null
          }
        },
        information_detail:  {
          where: {
            deleted_at: null
          }
        },
        csi_template: true,
        trigger: true,
      },
    });

    const total = await this.dbService.email_messages.count({
      where,
    });

    return {
      total,
      data: emailMessage,
      skip,
      page,
      take,
    };
  }

  async findOne(id: number) {
    const emailMessage = await this.dbService.email_messages.findFirst({
      where: {
        id,
      },
      include: {
        terms_detail: true,
        information_detail: true,
        csi_template: true,
        trigger: true,
      },
    });

    return emailMessage;
  }

  async update(
    id: number,
    updateEmailMessageDto: UpdateEmailMessageDto,
    user_id: number,
  ) {
    try {
      const termsDetail: Prisma.terms_detailUpsertWithWhereUniqueWithoutEmail_messagesInput[] =
        updateEmailMessageDto.terms_detail
          ? updateEmailMessageDto.terms_detail.map((item) => {
              return {
                where: {
                  id: item.id ?? 0,
                },
                update: {
                  terms: item.term,
                },
                create: {
                  terms: item.term,
                },
              };
            })
          : undefined;

      const informationDetail: Prisma.information_detailUpsertWithWhereUniqueWithoutEmail_messagesInput[] =
        updateEmailMessageDto.information_detail
          ? updateEmailMessageDto.information_detail.map((item) => {
              return {
                where: {
                  id: item.id ?? 0,
                },
                update: {
                  information: item.information,
                },
                create: {
                  information: item.information,
                },
              };
            })
          : undefined;

      const data: Prisma.email_messagesUpdateInput = {
        email_type: updateEmailMessageDto.email_type,
        greetings: updateEmailMessageDto.greetings,
        welcome_header: updateEmailMessageDto.welcome_header,
        footer: updateEmailMessageDto.footer,
        is_active: Boolean(updateEmailMessageDto.is_active),
        updated_at: new Date(),
        updated_by: user_id,
        terms_detail: {
          upsert: termsDetail,
        },
        information_detail: {
          upsert: informationDetail,
        },
        trigger: updateEmailMessageDto?.trigger_id
          ? {
              connect: {
                id: updateEmailMessageDto.trigger_id,
              },
            }
          : undefined,
        title: updateEmailMessageDto?.title,
        bcc: updateEmailMessageDto?.bcc
          ? updateEmailMessageDto?.bcc
              .split(',')
              .map((s) => s.trim())
              .join(',')
          : undefined,
        cc: updateEmailMessageDto?.cc
          ? updateEmailMessageDto?.cc
              .split(',')
              .map((s) => s.trim())
              .join(',')
          : undefined,
        csi_template: updateEmailMessageDto?.csi_id
          ? {
              connect: {
                id: updateEmailMessageDto.csi_id,
              },
            }
          : undefined,
      };

      const [emailMessage] = await this.dbService.$transaction([
        this.dbService.email_messages.update({
          where: {
            id,
          },
          data,
        }),
        ...(updateEmailMessageDto.terms_detail ? [
          this.dbService.terms_detail.updateMany({
            where: {
              id: {
                notIn: updateEmailMessageDto.terms_detail.map((i) => i.id)
              }
            },
            data: {
              deleted_at: new Date(),
              deleted_by: user_id
            }
          })
        ] : []),
        ...(updateEmailMessageDto.information_detail ? [
          this.dbService.information_detail.updateMany({
            where: {
              id: {
                notIn: updateEmailMessageDto.information_detail.map((i) => i.id)
              }
            },
            data: {
              deleted_at: new Date(),
              deleted_by: user_id
            }
          })
        ] : [])
      ]);

      return emailMessage;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    const emailMessage = await this.dbService.email_messages.update({
      where: {
        id,
      },
      data: {
        is_active: false,
        deleted_at: new Date(),
        deleted_by: user_id,
      },
    });

    return emailMessage;
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async mailTriggerScheduler() {
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
            some: {}, // Only get order where it have a details
          },
          deleted_at: null,
          deleted_by: null,
        },
      });

      if (orders.length) {
        this.logger.log(
          `Order found for status id ${status_id} [${orders.length}]`,
        );

        const jobs: {
          name?: string;
          data: OrderMailInterface;
          opts?: JobOptions;
        }[] = [];
        let delay: number = 5000;

        for (let index = 0; index < orders.length; index++) {
          const order = orders[index];
          const countSendedEmail = await this.dbService.mail_logs.count({
            where: {
              moduleId: order.id,
              emailMessageId: template_id,
              status: 1,
            },
          });

          const jobId = `send-order-mail-${order.id}-${template_id}`;
          const jobExist = await this.emailQueue.getJob(jobId);

          if (!countSendedEmail && !jobExist) {
            this.logger.log(
              `Sending email for order ${order.id} status ${status_id}`,
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
        }

        if (jobs.length > 0) {
          this.logger.verbose(`Jobs triggered [${jobs.length}] => ${jobs}`);
          await this.emailQueue.addBulk(jobs);
        }
      } else {
        this.logger.verbose(`Order not found for status id ${status_id}`);
      }
    } catch (error) {
      console.error(error);
      this.logger.error(template_id, status_id);
    }
  }

  async handleQuotationTriggers(template_id: number, status_id: number) {
    const quotations = await this.dbService.quotation.findMany({
      where: {
        quotation_status: status_id,
        readiness: {
          in: [1, 4]
        },
        deleted_at: null,
        deleted_by: null,
      },
    });

    if (quotations.length) {
      // const jobsToRemove = await this.emailQueue.getJobs([
      //   'active',
      //   'waiting',
      //   'delayed',
      //   'completed',
      //   'failed',
      // ]);
      // const jobsToRemovePrefix = 'send-quotation-mail';

      // Remove existing jobs with the specified prefix
      // for (const job of jobsToRemove) {
      //   const jobId = job.id.toString(); // Convert job ID to string
      //   if (jobId.startsWith(jobsToRemovePrefix)) {
      //     await job.remove();
      //     // console.log(`Removed job with ID: ${job.id}`);
      //   }
      // }

      const jobs: { name?: string; data: object; opts?: JobOptions }[] = [];
      let delay: number = 2000;

      for (let index = 0; index < quotations.length; index++) {
        const quotation = quotations[index];
        // console.log('Quotation ID:', quotation.id);
        const countSendedEmail = await this.countMailLogs(
          quotation.order_id,
          template_id,
        );
        // console.log(countSendedEmail, 'COUNT SEND EMAIL');

        const jobId = `send-quotation-mail-${quotation.id}-${template_id}`;
        const jobExist = await this.emailQueue.getJob(jobId);
        // console.log('Job Exist:', jobExist, 'for Job ID:', jobId);

        if (!countSendedEmail && !jobExist) {
          this.logger.log(
            `Sending email for quotation ${quotation.id} - ${template_id}`,
          );
          const jobData = {
            module_id: quotation.id,
            template_id: template_id,
          };
          jobs.push({
            name: 'send-quotation-mail',
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
        console.log('Jobs added to the queue:', jobs); // Confirm jobs are added
      }
    } else {
      this.logger.verbose(`Quotation not found for status id ${status_id}`);
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
    });

    if (quotations.length) {
      // const jobsToRemove = await this.emailQueue.getJobs([
      //   'active',
      //   'waiting',
      //   'delayed',
      //   'completed',
      //   'failed',
      // ]);
      // const jobsToRemovePrefix = 'send-quotation-payment-mail';

      // // Remove existing jobs with the specified prefix
      // for (const job of jobsToRemove) {
      //   const jobId = job.id.toString(); // Convert job ID to string
      //   if (jobId.startsWith(jobsToRemovePrefix)) {
      //     await job.remove();
      //     // console.log(`Removed job with ID: ${job.id}`);
      //   }
      // }

      const jobs: { name?: string; data: object; opts?: JobOptions }[] = [];
      let delay: number = 2000;
      console.log(template_id, "TEMPLATE ID");
      

      for (let index = 0; index < quotations.length; index++) {
        const quotation = quotations[index];
        // console.log('Quotation ID:', quotation.id);
        const countSendedEmail = await this.countMailLogs(
          quotation.order_id,
          template_id,
        );
        // console.log(countSendedEmail, 'COUNT SEND EMAIL');

        const jobId = `send-quotation-payment-mail-${quotation.id}-${template_id}`;
        const jobExist = await this.emailQueue.getJob(jobId);
        // console.log('Job Exist:', jobExist, 'for Job ID:', jobId);

        if (!countSendedEmail && !jobExist) {
          this.logger.log(
            `Sending email for quotation ${quotation.id} - ${template_id}`,
          );
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
    });

    if (complaints.length) {
      this.logger.log(
        `Complaint found for status id ${status_id} [${complaints.length}]`,
      );

      const jobs: { name?: string; data: object; opts?: JobOptions }[] = [];
      let delay: number = 5000;

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
          this.logger.log(
            `Sending email for complaint ${complaint.id} status ${status_id}`,
          );
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
      let delay: number = 5000;

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
          this.logger.log(
            `Sending email for reschedule ${reschedule.id} status ${status_id}`,
          );
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
    });

    if (refunds.length) {
      this.logger.log(
        `Refund found for status id ${status_id} [${refunds.length}]`,
      );

      const jobs: { name?: string; data: object; opts?: JobOptions }[] = [];
      let delay: number = 5000;

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
          this.logger.log(
            `Sending email for refund ${refund.id} status ${status_id}`,
          );
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
      let delay: number = 5000;

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

        if (!countSendedEmail && !jobExist) {
          this.logger.log(
            `Sending email for csi ${order.id} status ${status_id}`,
          );
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

  private async countMailLogs(moduleId: number, template_id: number) {
    return await this.dbService.mail_logs.count({
      where: {
        moduleId,
        emailMessageId: template_id,
        status: 1,
      },
    });
  }
}
