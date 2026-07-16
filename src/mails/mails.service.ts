/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class MailsService {
  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
  ) { }

  private readonly logger = new Logger(MailsService.name);

  async create(
    createEmailMessageDto: CreateEmailMessageDto,
    user_id: number,
    files: { [name: string]: Express.Multer.File[] },
  ) {
    const { header_files, footer_files } = files;
    const header: Array<Prisma.email_message_imageCreateManyEmail_messageInput> =
      header_files?.map((item) => ({
        type: 1,
        path: item.filename,
        created_by: user_id,
      }));
    const footer: Array<Prisma.email_message_imageCreateManyEmail_messageInput> =
      footer_files?.map((item) => ({
        type: 2,
        path: item.filename,
        created_by: user_id,
      }));
    const evidence = [...(header || []), ...(footer || [])];
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
      email_message_image:
        header_files || footer_files
          ? {
            createMany: { data: evidence },
          }
          : undefined,
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
            id: Number(createEmailMessageDto.csi_id),
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
      deleted_at: null,
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
            deleted_at: null,
          },
        },
        information_detail: {
          where: {
            deleted_at: null,
          },
        },
        csi_template: true,
        trigger: true,
        email_message_image: {
          where: {
            deleted_at: null,
          },
        },
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
        terms_detail: {
          where: {
            deleted_at: null,
          },
        },
        information_detail: {
          where: {
            deleted_at: null,
          },
        },
        csi_template: true,
        trigger: true,
        email_message_image: {
          where: {
            deleted_at: null,
          },
        },
      },
    });

    return emailMessage;
  }

  async update(
    id: number,
    updateEmailMessageDto: UpdateEmailMessageDto,
    user_id: number,
    files: { [name: string]: Express.Multer.File[] } = {},
  ) {
    try {
      const { header_files = [], footer_files = [] } = files || {};

      const header: Array<Prisma.email_message_imageCreateManyEmail_messageInput> =
        header_files.map((item) => ({
          type: 1,
          path: item.filename,
          created_by: user_id,
        }));

      const footer: Array<Prisma.email_message_imageCreateManyEmail_messageInput> =
        footer_files.map((item) => ({
          type: 2,
          path: item.filename,
          created_by: user_id,
        }));

      const evidence = [...header, ...footer];
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

      const deletedInformationId = updateEmailMessageDto.information_detail
        ? updateEmailMessageDto.information_detail
          .filter((x) => Boolean(x?.id))
          .map((item) => {
            return item.id;
          })
        : undefined;

      const deletedTermsDetailsId = updateEmailMessageDto.terms_detail
        ? updateEmailMessageDto.terms_detail
          .filter((x) => Boolean(x?.id))
          .map((item) => {
            return item.id;
          })
        : undefined;

      const data: Prisma.email_messagesUpdateInput = {
        email_type: updateEmailMessageDto.email_type,
        greetings: updateEmailMessageDto.greetings,
        welcome_header: updateEmailMessageDto.welcome_header,
        footer: updateEmailMessageDto.footer,
        is_active: Boolean(updateEmailMessageDto.is_active),
        email_message_image: {
          createMany: { data: evidence },
        },
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

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      await this.dbService.$transaction([
        ...(header_files?.length || footer_files?.length
          ? [
            this.dbService.email_message_image.deleteMany({
              where: {
                email_message_id: id,
                ...(header_files?.length && !footer_files?.length
                  ? { type: 1 }
                  : {}),
                ...(footer_files?.length && !header_files?.length
                  ? { type: 2 }
                  : {}),
              },
            }),
          ]
          : []),
        this.dbService.terms_detail.updateMany({
          where: {
            ...(deletedTermsDetailsId && deletedTermsDetailsId.length
              ? {
                id: {
                  notIn: deletedTermsDetailsId,
                },
              }
              : undefined),
            email_messages_id: id,
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
          },
        }),
        this.dbService.information_detail.updateMany({
          where: {
            ...(deletedInformationId && deletedInformationId.length
              ? {
                id: {
                  notIn: deletedInformationId,
                },
              }
              : undefined),
            email_messages_id: id,
          },
          data: {
            deleted_at: new Date(),

            deleted_by: user_id,
          },
        }),
        this.dbService.email_messages.update({
          where: {
            id,
          },
          data,
        }),
      ]);

      const emailMessage = await this.dbService.email_messages.findFirst({
        where: {
          id,
        },
        include: {
          terms_detail: {
            where: {
              deleted_at: null,
            },
          },
          information_detail: {
            where: {
              deleted_at: null,
            },
          },
          csi_template: true,
          trigger: true,
          email_message_image: {
            where: {
              deleted_at: null,
            },
          },
        },
      });

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

      for (let index = 2; index < mail_messages.length; index++) {
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
}
