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
        terms_detail: true,
        information_detail: true,
        csi_template: true,
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
      },
    });

    return emailMessage;
  }

  async update(
    id: number,
    updateEmailMessageDto: UpdateEmailMessageDto,
    user_id: number,
  ) {
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
      is_active: updateEmailMessageDto.is_active,
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
        .split(',')
        .map((s) => s.trim())
        .join(','),
      cc: updateEmailMessageDto?.cc
        .split(',')
        .map((s) => s.trim())
        .join(','),
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
    ]);

    return emailMessage;
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
    this.logger.verbose('Initiate mail trigger checks');
    const mail_messages = await this.dbService.email_messages.findMany({
      where: {
        deleted_at: null,
        deleted_by: null,
        is_active: true,
      },
    });

    if (mail_messages.length > 0) {
      for (let index = 0; index < mail_messages.length; index++) {
        const template = mail_messages[index];
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
          case MailType.CSI:
            break;

          case MailType.REFUND:
            break;

          case MailType.COMPLAIN:
            break;

          case MailType.RESCHEDULE:
            break;

          default:
            break;
        }
        // this.logger.log(template);
      }
    }
  }

  async handleOrderTriggers(template_id: number, status_id: number) {
    const orders = await this.dbService.orders.findMany({
      where: {
        project_status_id: status_id,
      },
    });

    if (orders) {
      this.logger.log(
        `Order found for status id ${status_id} [${orders.length}]`,
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
        const jobId = `send-order-mail-${order.id}-${template_id}`;
        const jobExist = await this.emailQueue.getJob(jobId);

        if (!countSendedEmail && !jobExist) {
          this.logger.log(
            `Sending email for order ${order.id} status ${status_id}`,
          );
          jobs.push({
            name: 'send-order-mail',
            data: {
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
      throw new ServiceUnavailableException(
        `Order not found for status id ${status_id}`,
      );
    }
  }

  async handleQuotationTriggers(template_id: number, status_id: number) {
    const quotations = await this.dbService.quotation.findMany({
      where: {
        quotation_status: status_id,
      },
    });

    if (quotations) {
      const jobs: { name?: string; data: object; opts?: JobOptions }[] = [];
      let delay: number = 2000;

      for (let index = 0; index < quotations.length; index++) {
        const quotation = quotations[index];
        const countSendedEmail = await this.countMailLogs(
          quotation.id,
          template_id,
        );
        const jobId = `send-quotation-mail-${quotation.id}-${template_id}`;
        const jobExist = await this.emailQueue.getJob(jobId);

        if (!countSendedEmail && !jobExist) {
          this.logger.log(
            `Sending email for quotation ${quotation.id} - ${quotation.quotation_number}`,
          );
          jobs.push({
            name: 'send-quotation-mail',
            data: {
              id: quotation.id,
              template_id,
            },
            opts: {
              jobId,
              delay,
            },
          });
          delay += 3000;
        }
      }

      if (jobs.length > 0) {
        this.logger.verbose(`Jobs triggered [${jobs.length}] => ${jobs}`);
        await this.emailQueue.addBulk(jobs);
      }
    } else {
      throw new ServiceUnavailableException(`Quotation not found`);
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
