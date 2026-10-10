/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma, users } from '@prisma/client';
import { CreateQuotationDto } from './dto/create-quotation.dto';

@Injectable()
export class QuotationQueryService {
  constructor(private readonly dbService: PrismaService) {}

  async findAll(queryParamsDto: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        status,
        date_from,
        date_to,
        order_by,
        vendor_id,
        store_id,
        promotion,
        is_free,
        is_paid,
      } = queryParamsDto;
      const skip = page * take - take;
      const where: Prisma.quotationWhereInput = {
        AND: [
          status ? { status: { id: { in: status } } } : null,
          ...(search
            ? [
              {
                OR: [
                  {
                    id: !isNaN(+search) ? +search : undefined,
                  },
                  {
                    order_id: !isNaN(+search) ? +search : undefined,
                  },
                  {
                    order: { vendor: { company_name: { contains: search } } },
                  },
                  {
                    quotation_details: {
                      some: {
                        name: {
                          contains: search,
                        },
                      },
                    },
                  },
                  {
                    order: {
                      members: {
                        full_name: {
                          contains: search,
                        },
                      },
                    },
                  },
                  { store: { store_name: { contains: search } } },
                  { quotation_number: { contains: search } },
                ],
              },
            ]
            : []),
          ...(is_free
            ? [
              {
                order: {
                  m_order_details: {
                    every: {
                      item: {
                        type: 1,
                      },
                    },
                  },
                },
              },
            ]
            : []),
          date_from && date_to
            ? {
              created_at: {
                gte: new Date(`${date_from}T00:00:00.000Z`),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            }
            : null,
          vendor_id
            ? {
              order: {
                vendor_id: vendor_id,
              },
            }
            : undefined,
          store_id
            ? {
              order: {
                store_id: store_id[0]
              }
            }
            : undefined,
          Boolean(is_paid)
            ? {
              receipt_quotation: {
                not: null,
              },
            }
            : undefined,
          ...(Boolean(promotion)
            ? [
              {
                promotion_id: {
                  not: null,
                },
              },
            ]
            : []),
        ].filter((condition) => Boolean(condition)),
        deleted_at: null,
        order: {
          deleted_at: null,
        },
      };
      const [quotation, quotationGrandTotalAgg, total] = await Promise.all([
        this.dbService.quotation.findMany({
          where,
          skip,
          take: take <= 0 ? undefined : take,
          orderBy: {
            created_at: order_by,
          },
          include: {
            quotation_follow_up: {
              where: {
                deleted_at: null,
              },
              orderBy: {
                created_at: 'desc',
              },
            },
            quotation_receipt: true,
            promotion: {
              where: {
                deleted_at: null,
              },
            },
            quotation_details: {
              where: {
                deleted_at: null,
                deleted_by: null,
              },
              include: {
                category: true,
              },
            },
            order: {
              include: {
                m_order_details: {
                  where: {
                    deleted_at: null,
                  },
                },
                status: true,
                vendor: true,
                store: true,
                members: true,
                sales: true,
                work_orders: {
                  include: {
                    work_order_status: {
                      include: {
                        status: true,
                      },
                    },
                    status: true,
                  },
                },
              },
            },
            status: true,
            store: true,
          },
        }),
        this.dbService.quotation.aggregate({
          where,
          _sum: {
            quotation_grand_total: true,
          },
        }),
        this.dbService.quotation.count({
          where,
        }),
      ]);

      const quotationGrandTotal =
        quotationGrandTotalAgg._sum.quotation_grand_total;
      const userIds = [
        ...new Set(
          quotation
            .flatMap((item) => [
              item.created_by,
              item.updated_by,
              item.deleted_by,
            ])
            .filter(Boolean),
        ),
      ];

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

      const userMap = users.reduce(
        (acc, user) => ({
          ...acc,
          [user.id]: user,
        }),
        {},
      );

      const quotationWithUser = quotation.map((item) => ({
        ...item,
        created_by: item.created_by ? userMap[item.created_by] || null : null,
        updated_by: item.updated_by ? userMap[item.updated_by] || null : null,
        deleted_by: item.deleted_by ? userMap[item.deleted_by] || null : null,
      }));

      return {
        data: quotationWithUser,
        total,
        page,
        take,
        quotationGrandTotal,
        meta: {
          skip,
          take,
          page,
          takeTotal: quotation.length,
          quotationGrandTotal,
          total,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  async findOne(id: number) {
    try {
      const quotation = await this.dbService.quotation.findFirst({
        where: {
          id,
          deleted_at: null,
          order: {
            deleted_at: null,
          },
        },
        include: {
          quotation_follow_up: {
            where: {
              deleted_at: null,
            },
            orderBy: {
              created_at: 'desc',
            },
          },
          promotion: true,
          quotation_files: true,
          quotation_receipt: true,
          quotation_details: {
            where: {
              deleted_at: null,
            },
            include: {
              category: true,
            },
          },
          order: {
            include: {
              m_order_details: true,
              members: true,
              vendor: true,
              status: true,
              work_orders: {
                include: {
                  work_order_evidences: true,
                  work_order_status: {
                    orderBy: {
                      id: 'desc',
                    },
                    include: {
                      work_order_items: {
                        orderBy: {
                          id: 'desc',
                        },
                      },
                    },
                  },
                  work_order_tukang: true,
                  status: true,
                },
              },
            },
          },
          status: true,
          store: true,
        },
      });
      const userIds = [
        quotation.created_by,
        quotation.updated_by,
        quotation.deleted_by,
      ].filter(Boolean);

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

      const userMap = Object.fromEntries(users.map((user) => [user.id, user]));

      // Attach user data to the quotations
      const quotationsWithUser = {
        ...quotation,
        created_by: userMap[quotation.created_by] || null,
        updated_by: userMap[quotation.updated_by] || null,
        deleted_by: userMap[quotation.deleted_by] || null,
      };

      return quotationsWithUser;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  async getCode() {
    try {
      const quotation = await this.dbService.quotation.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return quotation[0] || null;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }



  async quotationFollowUp(
    quotationFollowUpDto: CreateQuotationDto,
    user: users,
  ) {
    if (
      !quotationFollowUpDto.quotation_follow_up ||
      !quotationFollowUpDto.quotation_follow_up.length
    ) {
      throw new Error('Data follow-up tidak ditemukan.');
    }

    const { quotation_id } = quotationFollowUpDto.quotation_follow_up[0];

    const existingFollowUps = await this.dbService.quotation_follow_up.findMany(
      {
        where: { quotation_id },
      },
    );

    const requestIds = new Set(
      quotationFollowUpDto.quotation_follow_up.map((item) => item.id),
    );
    const existingIds = new Set(existingFollowUps.map((item) => item.id));

    const idsToDelete = [...existingIds].filter((id) => !requestIds.has(id));

    const deleteOperations = idsToDelete.map((id) =>
      this.dbService.quotation_follow_up.update({
        where: { id },
        data: { deleted_at: new Date(), deleted_by: user.id },
      }),
    );

    const upsertOperations = quotationFollowUpDto.quotation_follow_up.map(
      (item) => {
        if (!item.quotation_id) {
          throw new NotFoundException(
            `Quotation with ID ${item.quotation_id} not found!`,
          );
        }

        return this.dbService.quotation_follow_up.upsert({
          where: { id: item.id ?? 0, deleted_at: null },
          create: {
            follow_up_1: Boolean(item.follow_up_1),
            follow_up_2: Boolean(item.follow_up_2),
            follow_up_3: Boolean(item.follow_up_3),
            description: item.description,
            quotation: { connect: { id: item.quotation_id } },
            created_by: user.id,
          },
          update: {
            follow_up_1: Boolean(item.follow_up_1),
            follow_up_2: Boolean(item.follow_up_2),
            follow_up_3: Boolean(item.follow_up_3),
            description: item.description,
            quotation: { connect: { id: item.quotation_id } },
            updated_at: new Date(),
            updated_by: user.id,
          },
        });
      },
    );

    const results = await this.dbService.$transaction([
      ...deleteOperations,
      ...upsertOperations,
    ]);

    return results;
  }


}
