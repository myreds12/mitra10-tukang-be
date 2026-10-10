/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateEmailMessageDto } from './dto/create-email-message.dto';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateEmailMessageDto } from './dto/update-email-message.dto';
import { InjectQueue } from '@nestjs/bull';
import { JobOptions, Queue } from 'bull';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { MailsTriggerService } from './mails-trigger.service';
import { MailsDiagnosticsService } from './mails-diagnostics.service';

@Injectable()
export class MailsService {
  private readonly logger = new Logger(MailsService.name);

  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    private readonly triggerService: MailsTriggerService,
    private readonly diagnosticsService: MailsDiagnosticsService,
  ) {}

  async sendMailDirectOrQueue(options: {
    to: string;
    subject: string;
    template: string;
    context: any;
    from?: string;
    bcc?: string;
    cc?: string;
    queueJobName?: string;
    queueData?: any;
  }) {
    if (options.queueJobName) {
      try {
        return await this.emailQueue.add(
          options.queueJobName,
          options.queueData || {
            to: options.to,
            subject: options.subject,
            template: options.template,
            context: options.context,
          },
          { attempts: 3, delay: 1000 },
        );
      } catch (err) {
        this.logger.warn(
          `Failed to enqueue email job ${options.queueJobName}, falling back to direct send: ${err.message}`,
        );
      }
    }

    return await this.mailerService.sendMail({
      to: options.to,
      from:
        options.from ||
        this.configService.get<string>('MAIL_DEFAULTS') ||
        'instalasi@mitra10.com',
      subject: options.subject,
      template: options.template,
      context: options.context,
      bcc: options.bcc,
      cc: options.cc,
    });
  }

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



  async removeHistory(id: number) {
    const emailMessage = await this.dbService.mail_logs.delete({
      where: {
        id,
      },
    });

    return emailMessage;
  }



  // Delegations to MailsTriggerService
  async mailTriggerScheduler() {
    return this.triggerService.mailTriggerScheduler();
  }

  async handleOrderTriggers(template_id: number, status_id: number) {
    return this.triggerService.handleOrderTriggers(template_id, status_id);
  }

  async handleQuotationTriggers(template_id: number, status_id: number) {
    return this.triggerService.handleQuotationTriggers(template_id, status_id);
  }

  async handleQuotationPaymentTriggers(template_id: number, status_id: number) {
    return this.triggerService.handleQuotationPaymentTriggers(template_id, status_id);
  }

  async handleComplaintTriggers(template_id: number, status_id: number) {
    return this.triggerService.handleComplaintTriggers(template_id, status_id);
  }

  async handleRescheduleTriggers(template_id: number, status_id: number) {
    return this.triggerService.handleRescheduleTriggers(template_id, status_id);
  }

  async handleRefundTriggers(template_id: number, status_id: number) {
    return this.triggerService.handleRefundTriggers(template_id, status_id);
  }

  async handleCsiTriggers(template_id: number, status_id: number) {
    return this.triggerService.handleCsiTriggers(template_id, status_id);
  }

  // Delegations to MailsDiagnosticsService
  async sendTestEmail(targetEmail: string) {
    return this.diagnosticsService.sendTestEmail(targetEmail);
  }

  async traceRedis(): Promise<any> {
    return this.diagnosticsService.traceRedis();
  }
}
