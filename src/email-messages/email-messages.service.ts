import { Injectable } from '@nestjs/common';
import { CreateEmailMessageDto } from './dto/create-email-message.dto';
import { UpdateEmailMessageDto } from './dto/update-email-message.dto';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class EmailMessagesService {
  constructor (private readonly dbService : PrismaService){}
  async create(createEmailMessageDto: CreateEmailMessageDto, user_id: number) {
    const termsDetail : Prisma.terms_detailCreateManyEmail_messagesInput[] = createEmailMessageDto.terms_detail.map((item) => {
      return{
        terms: item.term
      }
    });

    const informationDetail : Prisma.information_detailCreateManyEmail_messagesInput[] = createEmailMessageDto.information_detail.map((item) => {
      return{
        information: item.information
      }      
    });

    const data : Prisma.email_messagesCreateInput = {
      email_type: createEmailMessageDto.email_type,
      greetings: createEmailMessageDto.greetings,
      welcome_header : createEmailMessageDto.welcome_header,
      footer: createEmailMessageDto.footer,
      created_by: user_id,
      terms_detail: {
        createMany:{
          data: termsDetail
        }
      },
      information_detail: {
        createMany: {
          data: informationDetail
        }
      }
    }
    const [emailMessage] = await this.dbService.$transaction([
      this.dbService.email_messages.create({
        data
      })
    ]);

    return emailMessage;
  }

  async findAll(query : QueryParamsDto) {
    const {type_email_message} = query;
    const where : Prisma.email_messagesWhereInput = {
      AND: [
        ...(type_email_message ? 
          [{
            email_type : {
              equals: type_email_message
            }
          } ]
        : [])
      ]
    }
    const emailMessage = await this.dbService.email_messages.findMany({
      where,
      include: {
        terms_detail: true,
        information_detail: true
      }
    });
    return emailMessage
  }

  async findOne(id: number) {
    const emailMessage = await this.dbService.email_messages.findFirst({
      where: {
      id
      }
    });

    return emailMessage;
  }

  async update(id: number, updateEmailMessageDto: UpdateEmailMessageDto, user_id: number) {
    const termsDetail : Prisma.terms_detailUpsertWithWhereUniqueWithoutEmail_messagesInput[] = updateEmailMessageDto.terms_detail.map((item) => {
      return{
        where: {
          id: item.id ?? 0
        },
        update: {
          terms: item.term
        },
        create: {
          terms: item.term
        }
      }
    });

    const informationDetail : Prisma.information_detailUpsertWithWhereUniqueWithoutEmail_messagesInput[] = updateEmailMessageDto.information_detail.map((item) => {
      return{
        where: {
          id: item.id ?? 0
        },
        update: {
          information: item.information
        },
        create: {
          information: item.information
        }
      }      
    });

    const data : Prisma.email_messagesUpdateInput = {
      email_type: updateEmailMessageDto.email_type,
      greetings: updateEmailMessageDto.greetings,
      welcome_header : updateEmailMessageDto.welcome_header,
      footer: updateEmailMessageDto.footer,
      updated_at: new Date(),
      updated_by: user_id,
      terms_detail: {
        upsert: termsDetail
      },
      information_detail: {
        upsert: informationDetail
      }
    }
    const [emailMessage] = await this.dbService.$transaction([
      this.dbService.email_messages.update({
        where: {
          id
        },
        data
      })
    ]);

    return emailMessage;
  }

  async remove(id: number, user_id: number) {
    const emailMessage = await this.dbService.email_messages.update({
      where: {
        id
      },
      data: {
        is_active: false,
        deleted_at: new Date(),
        deleted_by: user_id
      }
    });
    return emailMessage;
  }
}
