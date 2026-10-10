/* eslint-disable prettier/prettier */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from '../common/dto/query-params.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { Response } from 'express';
import { PdfService } from 'src/common/service/pdf.service';

@Injectable()
export class OrderFollowUpService {
  private readonly logger = new Logger(OrderFollowUpService.name);

  constructor(
    private readonly dbService: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

  async orderFollowUp(orderFollowUpDto: CreateOrderDto, user: users) {
    if (
      !orderFollowUpDto.order_follow_up ||
      !orderFollowUpDto.order_follow_up.length
    ) {
      throw new Error('Data follow-up tidak ditemukan.');
    }

    const { order_id } = orderFollowUpDto.order_follow_up[0];

    const existingFollowUps = await this.dbService.order_follow_up.findMany({
      where: { order_id },
    });

    const requestIds = new Set(
      orderFollowUpDto.order_follow_up.map((item) => item.id),
    );
    const existingIds = new Set(existingFollowUps.map((item) => item.id));

    const idsToDelete = [...existingIds].filter((id) => !requestIds.has(id));

    const deleteOperations = idsToDelete.map((id) =>
      this.dbService.order_follow_up.update({
        where: { id },
        data: { deleted_at: new Date(), deleted_by: user.id },
      }),
    );

    const upsertOperations = orderFollowUpDto.order_follow_up.map((item) => {
      if (!item.order_id) {
        throw new NotFoundException(
          `Quotation with ID ${item.order_id} not found!`,
        );
      }

      return this.dbService.order_follow_up.upsert({
        where: { id: item.id ?? 0, deleted_at: null },
        create: {
          csi_survey: Boolean(item.csi_survey),
          csi_work: Boolean(item.csi_work),
          description: item.description,
          orders: { connect: { id: item.order_id } },
          created_by: user.id,
        },
        update: {
          csi_survey: Boolean(item.csi_survey),
          csi_work: Boolean(item.csi_work),
          description: item.description,
          orders: { connect: { id: item.order_id } },
          updated_at: new Date(),
          updated_by: user.id,
        },
      });
    });

    const results = await this.dbService.$transaction([
      ...deleteOperations,
      ...upsertOperations,
    ]);

    return results;
  }

  async orderFollowUpPdf(res: Response, queryParams: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        status,
        date_from,
        date_to,
        order_by,
        sales_id,
        payment_type,
        store_id,
        vendor_id,
        work_order_status,
        is_invoice,
        is_active_warranty,
        tukang_id,
        is_expired_warranty,
        is_used_warranty,
        is_receipt,
        is_receipt_quotation,
        promotion,
        is_promotion,
      } = queryParams;

      const skip = page * take - take;
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const where: Prisma.ordersWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  { receipt_number: { contains: search } },
                  {
                    id: !isNaN(+search) ? +search : undefined,
                  },
                  { members: { full_name: { contains: search } } },
                  {
                    store: {
                      store_name: {
                        contains: search,
                      },
                    },
                  },
                  {
                    project_number: {
                      contains: search,
                    },
                  },
                  {
                    vendor: {
                      company_name: {
                        contains: search,
                      },
                    },
                  },
                  {
                    members: {
                      phone_number: {
                        contains: search,
                      },
                    },
                  },
                  {
                    members: {
                      whatsapp_number: {
                        contains: search,
                      },
                    },
                  },
                ],
              },
            ]
            : []),
          ...(is_promotion
            ? [
              {
                OR: [
                  {
                    AND: [
                      {
                        payment_type: 'gratis',
                      },
                      {
                        status: {
                          category: 'WORKEND',
                        },
                      },
                    ],
                  },
                  {
                    AND: [
                      {
                        payment_type: 'pemasangan_tanpa_survey',
                      },
                      {
                        status: {
                          category: 'WORKEND',
                        },
                      },
                    ],
                  },
                  {
                    AND: [
                      {
                        quotation: {
                          some: {
                            promotion_id: {
                              not: null,
                            },
                          },
                        },
                      },
                      {
                        status: {
                          category: 'WORKEND',
                        },
                      },
                    ],
                  },
                ],
              },
            ]
            : []),
          ...(sales_id ? [{ sales_id: { equals: sales_id } }] : []),
          ...(status ? [{ status: { id: { in: status } } }] : []),
          ...(work_order_status
            ? [{ work_orders: { status: { id: { in: work_order_status } } } }]
            : []),
          ...(payment_type ? [{ payment_type: { equals: payment_type } }] : []),
          store_id
            ? {
              store_id: {
                in: store_id,
              },
            }
            : undefined,
          vendor_id
            ? {
              vendor: {
                id: vendor_id,
                deleted_at: null,
              },
            }
            : undefined,
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
          ...(tukang_id
            ? [
              {
                work_orders: {
                  work_order_tukang: {
                    some: {
                      tukang_id: tukang_id,
                    },
                  },
                },
              },
            ]
            : []),
          ...(Boolean(is_invoice)
            ? [
              {
                invoice_details: {
                  none: {
                    deleted_at: null,
                  },
                },
              },
            ]
            : []),
          ...(Boolean(is_active_warranty)
            ? [
              {
                work_orders: {
                  work_order_status: {
                    some: {
                      status: {
                        category: 'WORKEND',
                      },
                      created_at: {
                        gte: sevenDaysAgo,
                      },
                    },
                  },
                },
              },
            ]
            : []),
          ...(Boolean(is_expired_warranty)
            ? [
              {
                OR: [
                  {
                    work_orders: {
                      work_order_status: {
                        some: {
                          status: {
                            category: 'WORKEND',
                          },
                          created_at: {
                            lt: sevenDaysAgo,
                          },
                        },
                      },
                    },
                  },
                  {
                    complaints: {
                      some: {
                        deleted_at: null,
                      },
                    },
                  },
                ],
              },
            ]
            : []),
          ...(Boolean(is_receipt)
            ? [
              {
                receipt_number: {
                  not: null,
                },
              },
            ]
            : []),
          ...(is_receipt_quotation
            ? [
              {
                quotation: {
                  some: {
                    receipt_quotation: {
                      not: null,
                    },
                  },
                },
              },
            ]
            : []),
          ...(Boolean(promotion)
            ? [
              {
                quotation: {
                  some: {
                    promotion_id: {
                      not: null,
                    },
                  },
                },
              },
            ]
            : []),
          ...(Boolean(is_used_warranty)
            ? [{ complaints: { some: { deleted_at: null } } }]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      const orders = await this.dbService.orders.findMany({
        skip,
        take: take > 0 ? take : undefined,
        where,
        orderBy: {
          created_at: order_by,
        },
        include: {
          members: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              area_id: true,
              area: true,
              join_location: true,
              member_number: true,
              full_name: true,
              email: true,
              phone_number: true,
              whatsapp_number: true,
              address_1: true,
              address_2: true,
              zip_code: true,
              rating: true,
              join_date: true,
              created_at: true,
              updated_at: true,
              created_by: true,
              updated_by: true,
            },
          },
          order_follow_up: {
            where: {
              deleted_at: null,
            },
          },
          sales: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              store_id: true,
              user_id: true,
              full_name: true,
              nik: true,
              bank_id: true,
              bank_branch: true,
              account_name: true,
              is_active: true,
              created_at: true,
              updated_at: true,
              created_by: true,
              updated_by: true,
            },
          },
          store: {
            select: {
              id: true,
              store_name: true,
              address: true,
              area_id: true,
              area: true,
              zip_code: true,
              created_at: true,
              updated_at: true,
              created_by: true,
              updated_by: true,
            },
          },
          status: {
            select: {
              id: true,
              category: true,
              description: true,
            },
          },
          vendor: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              company_name: true,
              address: true,
              phone_number: true,
              is_active: true,
              work_orders: {
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
            },
          },
          m_order_details: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              order_id: true,
              item_code: true,
              item_name: true,
              item_notes: true,
              item_id: true,
              item: {
                select: {
                  id: true,
                  item_name: true,
                  category: true,
                  default_price: true,
                  service_name: true,
                },
              },
              sales: true,
              unit_price: true,
              quantity: true,
              total: true,
              comission: true,
              created_by: true,
              created_at: true,
            },
          },
        },
      });

      const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
      const filename = `order-follow-up-${timestamp}.pdf`;

      const data = {
        orders,
      };

      const buffer = await this.pdfService.generate('order-follow-up', data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.send(buffer);
    } catch (error) {
      this.logger.error('Error orderFollowUpPdf:', error);
      throw error;
    }
  }
}
