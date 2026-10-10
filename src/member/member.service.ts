/* eslint-disable prettier/prettier */
import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { MemberExportService } from './member-export.service';
import { MemberOrderExportService } from './member-order-export.service';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MemberService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly memberExportService: MemberExportService,
    private readonly memberOrderExportService: MemberOrderExportService,
  ) { }

  async create(createMemberDto: CreateMemberDto, user_id) {
    try {
      const store = await this.dbService.store.findFirst({
        where: {
          id: createMemberDto.join_location,
          deleted_at: null,
        },
      });
      if (!store) {
        throw new BadRequestException('Toko tidak ditemukan!');
      }

      if (!createMemberDto.email) {
        throw new BadRequestException('Email wajib diisi!');
      }

      //buat kan agar phone number dan whatsapp number menggunakan format 08 di awal dengan mengubah nya dan bukan sebuah validasi, dengan contoh input +628 dan diubah menjadi 08 
      const formatPhoneNumber = (number: string) => {
        if (number.startsWith('+62')) {
          return '0' + number.slice(3);
        } else if (number.startsWith('62')) {
          return '0' + number.slice(2);
        } else {
          return number;
        }
      };

      const formattedPhoneNumber = createMemberDto.phone_number
        ? formatPhoneNumber(createMemberDto.phone_number)
        : null;
      const formattedWhatsappNumber = createMemberDto.whatsapp_number
        ? formatPhoneNumber(createMemberDto.whatsapp_number)
        : null;
      createMemberDto.phone_number = formattedPhoneNumber;
      createMemberDto.whatsapp_number = formattedWhatsappNumber;
      const existingMember = await this.dbService.members.findFirst({
        where: {
          join_location: createMemberDto.join_location,
          deleted_at: null,
          OR: [
            { email: createMemberDto.email },
            ...(createMemberDto.phone_number
              ? [{ phone_number: createMemberDto.phone_number }]
              : []),
            ...(createMemberDto.whatsapp_number
              ? [{ whatsapp_number: createMemberDto.whatsapp_number }]
              : []),
          ],
        },
      });
      if (existingMember) {
        if (existingMember.email === createMemberDto.email) {
          throw new BadRequestException('Email sudah terdaftar di toko ini!');
        }
        if (
          createMemberDto.phone_number &&
          existingMember.phone_number === createMemberDto.phone_number
        ) {
          throw new BadRequestException('Nomor telepon sudah terdaftar di toko ini!');
        }
        if (
          createMemberDto.whatsapp_number &&
          existingMember.whatsapp_number === createMemberDto.whatsapp_number
        ) {
          throw new BadRequestException('Nomor WhatsApp sudah terdaftar di toko ini!');
        }
      }

      const numberMember =
        createMemberDto.phone_number ?? createMemberDto.whatsapp_number;

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


  normalizePhone(value?: string | null): string | null {
    if (!value) return null;

    let v = value.trim();
    if (v === '') return null;

    v = v.replace(/[^0-9]/g, '');

    while (v.startsWith('62')) {
      v = v.slice(2);
    }

    if (v.startsWith('8')) {
      return '0' + v;
    }

    if (v.startsWith('08')) {
      return v;
    }

    return v;
  }

  async normalizePhoneNumbers(batchSize = 100) {
    let lastId = 0;
    let success = 0;
    let failed = 0;
    let skipped = 0;

    while (true) {
      const members = await this.dbService.members.findMany({
        where: { id: { gt: lastId } },
        orderBy: { id: 'asc' },
        take: batchSize,
      });

      if (members.length === 0) break;

      for (const m of members) {
        lastId = m.id;

        try {
          const memberNumber = this.normalizePhone(m.member_number);
          const whatsapp = this.normalizePhone(m.whatsapp_number);
          const phone = this.normalizePhone(m.phone_number);

          if (
            memberNumber === m.member_number &&
            whatsapp === m.whatsapp_number &&
            phone === m.phone_number
          ) {
            skipped++;
            continue;
          }

          await this.dbService.members.update({
            where: { id: m.id },
            data: {
              member_number: memberNumber,
              whatsapp_number: whatsapp,
              phone_number: phone,
            },
          });

          success++;
        } catch (err) {
          failed++;
          console.log('Gagal update id', m.id, err?.message);
        }
      }
    }

    return {
      success,
      failed,
      skipped,
    };
  }


  async findAll(query: QueryParamsDto) {
    try {
      const {
        search,
        date_from,
        date_to,
        store_id,
        page,
        take,
        top_best,
        order_date_from,
        order_date_to,
      } = query;

      const where: Prisma.membersWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  {
                    id: !isNaN(+search) ? +search : undefined,
                  },
                  { whatsapp_number: { contains: search } },
                  { phone_number: { contains: search } },
                  { member_number: { contains: search } },
                  {
                    full_name: {
                      contains: search,
                    }
                  },
                  {
                    join_location_store: {
                      store_name: {
                        contains: search
                      }
                    }
                  },
                  {
                    email: {
                      contains: search
                    }
                  }
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

      const skip = page * take - take;
      const [membersData, count] = await Promise.all([
        this.dbService.members.findMany({
          where,
          skip: Boolean(top_best) ? 0 : skip,
          take: take > 0 ? take : undefined,
          include: {
            join_location_store: true,
            area: true,
            order: {
              where: {
                AND: [
                  {
                    deleted_at: null,
                  },
                  ...(order_date_from && order_date_to
                    ? [
                      {
                        created_at: {
                          gte: new Date(order_date_from),
                          lte: new Date(`${order_date_to}T23:59:59.000Z`),
                        },
                      },
                    ]
                    : []),
                ],
              },
              select: {
                id: true,
                grand_total: true,
                quotation: {
                  select: {
                    id: true,
                    receipt_quotation: true,
                  },
                  take: 1,
                },
              },
              orderBy: {
                created_at: 'desc',
              },
            },
          },
        }),
        this.dbService.members.count({
          where,
        }),
      ]);

      let members = membersData;

      if (Boolean(top_best)) {
        members = members.sort((a, b) => b.order.length - a.order.length);
      }

      if (take > 0) {
        members = members.slice(0, take);
      }

      let orderMemberOne = 0;
      let orderMemberMany = 0;
      const dataMember = members.map((item) => {
        const totalOrder = item.order.length;

        if (item.order.length > 1) {
          orderMemberMany += 1;
        } else if (item.order.length === 1) {
          orderMemberOne += 1;
        }
        const totalUnpaid = item.order
          .filter((order) =>
            order?.quotation[0]?.receipt_quotation !== null
          )
          .reduce((total, order) => total + Number(order.grand_total), 0);

        const totalPaid = item.order
          .filter(
            (order) =>
              order?.quotation[0]?.receipt_quotation === null,
          )
          .reduce((total, order) => total + Number(order.grand_total), 0);

        return {
          ...item,
          total_order: totalOrder,
          total_unpaid: totalUnpaid,
          total_paid: totalPaid,
        };
      });

      return {
        data: dataMember,
        total: count,
        page,
        take,
        totalOrderOne: orderMemberOne,
        totalOrderMany: orderMemberMany,
        meta: {
          totalOrderOne: orderMemberOne,
          totalOrderMany: orderMemberMany,
          total: count,
          page,
          take,
          takeTotal: members.length,
        },
      };
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
              status: true,
              sales: true,
              m_order_details: true,
            },
            orderBy: {
              created_at: 'desc',
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

  async memberExportExcel(res: Response, queryParams: QueryParamsDto) {
    return this.memberExportService.memberExportExcel(res, queryParams);
  }

  async orderMemberExportExcel(res: Response, queryParams: QueryParamsDto) {
    return this.memberOrderExportService.orderMemberExportExcel(res, queryParams);
  }
}
