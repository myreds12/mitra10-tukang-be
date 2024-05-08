import { Injectable, HttpStatus, BadRequestException } from '@nestjs/common';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash } from 'bcrypt';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { SendEmailService } from 'src/mails/send-email.service';

@Injectable()
export class MemberService {
  constructor(private readonly dbService: PrismaService, private readonly sendMailService: SendEmailService,
  ) { }

  //TODO: NAMBAHIN MEMBER NUMBER
  async create(createMemberDto: CreateMemberDto, user_id) {
    try {
      const email_check = await this.dbService.members.findFirst({
        where: { email: createMemberDto.email },
      });
      if (email_check && createMemberDto.email) throw new BadRequestException('Email already exist!');
      const totalMember = (await this.dbService.members.count()) + 1;
      const defaultZero = '00000000';
      const numberMember =
        defaultZero.slice(0, 8 - totalMember.toString().length) +
        totalMember.toString();


        // TODO : add condition for numberMember when phone_number or whatsapp_number filled, use that instead
      const member = await this.dbService.members.create({
        data: {
          full_name: createMemberDto.full_name,
          email: createMemberDto.email,
          member_number: numberMember,
          address_1: createMemberDto.address_1,
          address_2: createMemberDto.address_2,
          join_date: createMemberDto.join_date
            ? new Date(createMemberDto.join_date)
            : undefined,
          phone_number: createMemberDto.phone_number,
          whatsapp_number: createMemberDto.whatsapp_number,
          zip_code: createMemberDto.zip_code,
          //join location diisi dengan store id
          join_location: createMemberDto.join_location
            ? createMemberDto.join_location
            : undefined,
          area_id: createMemberDto.area_id,
          rating: createMemberDto.rating,

          created_by: user_id,
        },
      });

      return {
        data: {
          member,
        },
        status: HttpStatus.CREATED,
        message: 'Successfully Create Data',
      };
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Failed to Create Data',
      };
    }
  }

  async findAll(query: QueryParamsDto, user_id: number) {
    try {
      const { search, date_from, date_to, store_id } = query;

      const where: Prisma.membersWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  { whatsapp_number: { contains: search } },
                  { member_number: { contains: search } },
                ],
              },
            ]
            : []),
          ...(store_id ? [
            {
              join_location_store: {
                id: {
                  in: store_id
                }
              }
            }
          ] : []),
          ...(date_from && date_to
            ? [
              {
                created_at: {
                  gte: new Date(date_from),
                  lte: new Date(`${date_to}T23:59:59.000Z`),
                },
              },
            ]
            : [])
        ].filter(Boolean),
        deleted_at: null,
      };
      const member = await this.dbService.members.findMany({
        where,
        include: {
          join_location_store: true,
          order: {
            include: {
              complaints: true,
              store: true,
              sales: true,
              m_order_details: true,
            },
          },
        },
      });
      const memberOrderSummary = member.map(item => ({
        memberId: item.id,
        totalOrder: item.order.reduce((total, order) => total + Number(order.grand_total), 0),
      }));

      const dataMember = member.map(item => ({
        ...item,
        total_summary: memberOrderSummary.find(summary => summary.memberId === item.id)?.totalOrder || 0,
      }));

      console.log(dataMember);

      return {
        status: HttpStatus.OK,
        message: 'Successfully get data',
        data: dataMember,
      };
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to get data',
      };
    }
  }

  async findOne(id: number) {
    try {
      const member = await this.dbService.members.findFirst({
        where: { id: id },
        include: {
          join_location_store: true,
          order: {
            include: {
              complaints: true,
              store: true,
              sales: true,
              m_order_details: true,
            },
          },
        },
      });

      return {
        data: member ,
        status: HttpStatus.OK,
        message: 'Successfully get data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to get data',
      };
    }
  }

  async update(id: number, updateMemberDto: UpdateMemberDto, user_id) {
    try {
      const updated_member = await this.dbService.members.update({
        where: { id: id },
        data: {
          full_name: updateMemberDto.full_name,
          email: updateMemberDto.email,
          address_1: updateMemberDto.address_1,
          address_2: updateMemberDto.address_2,
          join_date: updateMemberDto.join_date
            ? new Date(updateMemberDto.join_date)
            : undefined,
          phone_number: updateMemberDto.phone_number,
          whatsapp_number: updateMemberDto.whatsapp_number,
          zip_code: updateMemberDto.zip_code,
          join_location: updateMemberDto.join_location
            ? updateMemberDto.join_location
            : undefined,
          area_id: updateMemberDto.area_id,
          rating: updateMemberDto.rating,
          updated_at: new Date(),
          updated_by: user_id,
        },
        include:{
          join_location_store: true
        }
      });

      return {
        data: updated_member,
        status: HttpStatus.CREATED,
        message: 'Successfully update member data',
      };

    } catch (error) {
      console.log(error);
      
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to update member data',
      };
    }
  }

  async remove(id: number, user_id) {
    try {
      const delete_member = await this.dbService.members.update({
        where: { id: id },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully Delete Data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed To Delete Data',
      };
    }
  }
}
