import { Injectable, HttpStatus, BadRequestException } from '@nestjs/common';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class MemberService {
  constructor(private readonly dbService: PrismaService) {}

  //TODO: NAMBAHIN MEMBER NUMBER
  async create(createMemberDto: CreateMemberDto, user_id) {
    try {
      const email_check = await this.dbService.members.findFirst({
        where: { email: createMemberDto.email },
      });

      // const phone_wa_check = await this.dbService.members.findFirst({
      //   where: {
      //     OR: [
      //       ...(createMemberDto?.phone_number
      //         ? [{ phone_number: createMemberDto.phone_number }]
      //         : null),
      //       ...(createMemberDto?.whatsapp_number
      //         ? [{ whatsapp_number: createMemberDto.whatsapp_number }]
      //         : null),
      //     ].filter(Boolean),
      //   },
      // });

      if (email_check && createMemberDto.email)
        throw new BadRequestException('Email already exist!');
      // if (phone_wa_check)
      //   throw new BadRequestException(
      //     'Phone or WhatsApp number already exist!',
      //   );

      const numberMember =
        createMemberDto.phone_number ?? createMemberDto.whatsapp_number;

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

      return member;
    } catch (error) {
      console.log(error);

      throw error;
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
          ...(store_id
            ? [
                {
                  join_location_store: {
                    id: {
                      in: store_id,
                    },
                  },
                },
              ]
            : []),
          ...(date_from && date_to
            ? [
                {
                  created_at: {
                    gte: new Date(date_from),
                    lte: new Date(`${date_to}T23:59:59.000Z`),
                  },
                },
              ]
            : []),
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
      const memberOrderSummary = member.map((item) => ({
        memberId: item.id,
        totalOrder: item.order.reduce(
          (total, order) => total + Number(order.grand_total),
          0,
        ),
      }));

      const dataMember = member.map((item) => ({
        ...item,
        total_summary:
          memberOrderSummary.find((summary) => summary.memberId === item.id)
            ?.totalOrder || 0,
      }));

      return dataMember;
    } catch (error) {
      console.log(error);

      throw error;
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

      return member;
    } catch (error) {
      console.error(error);

      throw error;
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
        include: {
          join_location_store: true,
        },
      });

      return updated_member;
    } catch (error) {
      console.error(error);

      throw error;
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

      return delete_member;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }
}
