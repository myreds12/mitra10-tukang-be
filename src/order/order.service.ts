import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { PAYMENT_TYPE } from './enum/payment_type.enum';
import { QueryParamsDto } from '../common/dto/query-params.dto';
import { StatusService } from 'src/status/status.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class OrderService {
  constructor(private readonly dbService: PrismaService) {}

  async create(
    createOrderDto: CreateOrderDto,
    user: users,
    order_files: Array<Express.Multer.File>,
  ) {
    try {
      console.log(createOrderDto);

      const { id: user_id, role_id } = user;
      const ROLES = await this.dbService.roles.findMany();

      const SALES_ROLES = ROLES.find(({ name }) =>
        name.toLowerCase().includes('sales'),
      );
      const STORE_ROLES = ROLES.find(({ name }) =>
        name.toLowerCase().includes('store staff'),
      );
      const ADMIN_HO_ROLES = ROLES.find(({ name }) =>
        name.toLowerCase().includes('admin ho'),
      );

      const salesUser = await this.dbService.users.findFirst({
        where: { id: user_id },
        include: {
          sales: {
            ...(role_id !== SALES_ROLES?.id
              ? { where: { id: createOrderDto.sales_id } }
              : undefined),
            orderBy: {
              created_at: 'desc',
            },
            include: {
              sales_categories: true,
            },
          },
        },
      });

      // if(salesUser.sales.length === 0) throw new BadRequestException('Sales not found!');

      const orderDetailItems = await this.dbService.items.findMany({
        where: {
          id: {
            in: createOrderDto.order_details.map(({ item_id }) => item_id),
          },
        },
        include: {
          category: true,
          prices: {
            where: {
              periodic_start: { lte: new Date() },
              periodic_end: { gte: new Date() },
            },
          },
        },
      });

      if (orderDetailItems.some((item) => item === null))
        throw new BadRequestException('Item not found!');

      let grand_total = 0;
      let grand_total_comission = 0;

      const files: Array<Prisma.order_filesCreateManyOrderInput> =
        order_files.map((item) => ({
          type: 'any',
          path: item.filename,
          created_by: user_id,
        }));

      const ROLE_STATUS = await this.dbService.status.findFirst({
        where: {
          category: {
            equals: role_id === STORE_ROLES.id ? 'picklist' : 'book',
          },
        },
      });

      if (createOrderDto.payment_type === PAYMENT_TYPE.SURVEY) {
        grand_total += 99000;
      }

      const order_details: Prisma.m_order_detailsCreateManyOrderInput[] =
        createOrderDto.order_details.map((item) => {
          let total = 0;
          const currentItem = orderDetailItems?.find(
            ({ id }) => id === item?.item_id,
          );
          const itemPrice =
            currentItem?.prices.filter((x) => item.quantity >= x.min_order)?.[0]
              ?.price ??
            currentItem?.default_price ??
            0;
          const comission = Number(
            salesUser?.sales[0]?.sales_categories?.find(
              ({ category_id }) => currentItem?.category_id === category_id,
            )?.commission ?? 0,
          );

          if (
            PAYMENT_TYPE.PEMASANGAN_TANPA_SURVEY === createOrderDto.payment_type
          ) {
            total = Number(itemPrice) * item.quantity;
            grand_total += total;
            grand_total_comission += comission;
          }

          return {
            ...item,
            item_notes: item?.item_notes,
            unit_price: itemPrice,
            created_by: user_id,
            total,
            comission,
            sales_id: salesUser?.sales[0]?.id ?? createOrderDto.sales_id,
          };
        });
      if (createOrderDto.is_overdistance === 1)
        grand_total += createOrderDto.additional_fee ?? 25000;

      const orderConnection = Object.fromEntries(
        Object.entries({
          members: { connect: { id: createOrderDto.member_id } },
          store: { connect: { id: createOrderDto.store_id } },
          status: { connect: { id: createOrderDto.project_status_id } },
          sales: { connect: { id: createOrderDto.sales_id } },
          vendor: createOrderDto.vendor_id
            ? { connect: { id: createOrderDto.vendor_id } }
            : undefined,
        }).filter(([key, value]) => value !== undefined),
      );

      const orderData = {
        notes: createOrderDto.notes,
        project_address: createOrderDto.project_address,
        project_number: createOrderDto.project_number,
        receipt_number: createOrderDto.receipt_number,
        grand_total: grand_total.toFixed(2),
        grand_total_comission: grand_total_comission.toFixed(2),
        is_overdistance: createOrderDto.is_overdistance,
        ...(createOrderDto.is_overdistance === 1
          ? {
              additional_fee: createOrderDto.additional_fee,
            }
          : undefined),
        created_by: user_id,
        payment_type: createOrderDto.payment_type,
        print_counter: 0,
        request_survey: new Date(createOrderDto.request_survey),
      };

      const ordersOptions: Prisma.ordersCreateArgs = {
        data: {
          ...orderConnection,
          ...orderData,
          m_order_details: { createMany: { data: order_details } },
          order_files: { createMany: { data: files } },
        },
        include: {
          status: true,
        },
      };

      const [salesOrder, order] = await this.dbService.$transaction([
        this.dbService.sales.update({
          where: {
            id: salesUser?.sales[0]?.id ?? createOrderDto.sales_id,
          },
          data: {
            order_total: {
              increment: 1,
            },
          },
        }),
        this.dbService.orders.create({
          data: {
            ...ordersOptions.data,
          },
          include: {
            status: true,
          },
        }),
      ]);

      await this.addHistory(
        order.id,
        order.project_status_id,
        user,
        createOrderDto,
      );

      console.log(order);

      return order;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async findAll(queryParams: QueryParamsDto) {
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
      } = queryParams;

      const skip = page * take - take;

      const where: Prisma.ordersWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    { receipt_number: { contains: search } },
                    {
                      id: !isNaN(+search) ? +search : undefined 
                    },
                    // TODO: FIXME
                    // { request_survey: { equals: new Date(search) } },
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
                          contains: search
                        }
                      }
                    },
                    {
                      members: {
                        phone_number: {
                          contains: search
                        }
                      }
                    },
                    {
                      members: {
                        whatsapp_number: {
                          contains: search
                        }
                      }
                    }
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
          // ...(Boolean(is_invoice) ? {
          //     invoice_details: {
          //       none: {
          //         deleted_at: null
          //       }
          //     }
          //   } : {}),
          ...(Boolean(is_invoice)
            ? [
                {
                  invoice_details: {
                    none: {
                      deleted_at: null,
                    },
                  },
                  // order_history: {
                  //   some: {
                  //     status: {
                  //       category: {
                  //         in: ['SURVEYDONE', 'WORKEND', 'DONE'],
                  //       },
                  //     },
                  //   },
                  // },
                },
              ]
            : []),
          //
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
          invoice_details: {
            where: {
              deleted_at: null,
            },
            select: {
              invoices: {
                select: {
                  id: true,
                  status: true,
                  total_amount: true,
                  invoice_logs: true,
                  description: true,
                  vendor: true,
                },
              },
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
          complaints: true,
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
          order_history: {
            select: {
              order_id: true,
              created_at: true,
              status: {
                select: {
                  id: true,
                  category: true,
                  description: true,
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
          quotation: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            include: {
              promotion: true,
              quotation_details: {
                include: {
                  item: true,
                },
              },
              quotation_files: true,
            },
          },
          work_orders: {
            where: {
              deleted_at: null,
            },
            include: {
              request_tukang: {
                include: {
                  tukang_to_request_tukang: true,
                  tukang_to_replace_tukang: true,
                },
              },
              vendor: true,
              work_order_evidences: true,
              work_order_tukang: {
                include: {
                  tukang: true,
                },
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
              work_order_status: {
                include: {
                  status: true,
                  work_order_items: {
                    include: {
                      item: true,
                    },
                    where: {
                      deleted_at: null,
                      deleted_by: null,
                    },
                  },
                },
                orderBy: {
                  created_at: 'desc',
                },
              },
            },
          },
          order_files: true,
        },
      });
      const userIds = [
        ...new Set(
          orders
            .flatMap((order) => [
              order.created_by,
              order.updated_by,
              order.deleted_by,
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

      const ordersWithUser = orders.map((order) => ({
        ...order,
        created_by: order.created_by ? userMap[order.created_by] || null : null,
        updated_by: order.updated_by ? userMap[order.updated_by] || null : null,
        deleted_by: order.deleted_by ? userMap[order.deleted_by] || null : null,
      }));
      const count = await this.dbService.orders.count({
        where,
      });
      const orderGrandTotal = orders.reduce((total, order) => {
        let grandTotal = Number(order.grand_total) || 0;

        if (order.payment_type === 'survey' && order.quotation) {
          const quotationGrandTotal = order.quotation.reduce(
            (qTotal, quotation) => {
              return qTotal + Number(quotation.quotation_grand_total);
            },
            0,
          );

          grandTotal += quotationGrandTotal;
        }

        return total + grandTotal;
      }, 0);

      return {
        data: ordersWithUser,
        meta: {
          total: count,
          orderGrandTotal,
          page,
          take,
          takeTotal: orders.length,
        },
      };
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const order = await this.dbService.orders.findFirst({
        where: {
          id,
          deleted_at: null,
        },
        include: {
          members: true,
          sales: true,
          status: true,
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
          store: true,
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
              item_id: true,
              item: {
                select: {
                  id: true,
                  item_name: true,
                  category: true,
                  prices: true,
                  default_price: true,
                  service_name: true,
                },
              },
              item_notes: true,
              unit_price: true,
              quantity: true,
              total: true,
              comission: true,
              created_by: true,
              created_at: true,
            },
          },
          order_files: {
            where: {
              deleted_at: null,
            },
          },
          complaints: true,
          quotation: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            orderBy: {
              created_at: 'desc',
            },
            include: {
              promotion: true,
              quotation_details: {
                where: {
                  deleted_at: null,
                },
              },
              quotation_files: true,
            },
          },
          work_orders: {
            include: {
              request_tukang: {
                include: {
                  tukang_to_request_tukang: true,
                  tukang_to_replace_tukang: true,
                },
              },
              vendor: true,
              work_order_evidences: true,
              work_order_tukang: {
                include: {
                  tukang: true,
                },
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
              work_order_status: {
                include: {
                  status: true,
                  work_order_items: {
                    include: {
                      item: true,
                    },
                    where: {
                      deleted_at: null,
                      deleted_by: null,
                    },
                  },
                },
                orderBy: {
                  created_at: 'desc',
                },
              },
            },
          },
          order_history: {
            select: {
              order_id: true,
              payload: true,
              created_at: true,
              status: {
                select: {
                  id: true,
                  category: true,
                  description: true,
                },
              },
            },
          },
          invoice_details: true,
        },
      });

      const userIds = [
        order.created_by,
        order.updated_by,
        order.deleted_by,
      ].filter(Boolean);

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

      const userMap = Object.fromEntries(users.map((user) => [user.id, user]));

      // Attach user data to the orders
      const ordersWithUser = {
        ...order,
        created_by: userMap[order.created_by] || null,
        updated_by: userMap[order.updated_by] || null,
        deleted_by: userMap[order.deleted_by] || null,
      };

      const logs = await this.dbService.mail_logs.findMany({
        where: {
          moduleId: id,
        },
        select: {
          id: true,
          emailMessageId: true,
          moduleId: true,
          data: true,
          to: true,
          status: true,
          createdAt: true,
          emailMessages: true,
        },
      });

      const mailLogs = logs.filter((item) => {
        try {
          const dataMailLogs = JSON.parse(item.data);
          return dataMailLogs.order && dataMailLogs.order.id === id;
        } catch (error) {
          console.error('Failed to parse mail log data', error);
          return false;
        }
      });

      const data = {
        ...ordersWithUser,
      };

      data['order_details'] = data.m_order_details;
      delete data.m_order_details;

      return {
        data,
        meta: {
          mailLogs: mailLogs,
          dataLogs: mailLogs.map((item) => JSON.parse(item.data)),
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(
    id: number,
    updateOrderDto: UpdateOrderDto,
    user?: users,
    order_files?: Express.Multer.File[],
  ) {
    try {
      const { id: user_id, role_id } = user;
      const currentUser = await this.dbService.users.findFirst({
        where: {
          id: user_id,
        },
        include: {
          roles: true,
          sales: true,
        },
      });
      const files: Array<Prisma.order_filesCreateManyOrderInput> =
        order_files.map((item) => ({
          type: 'any',
          path: item.filename,
          created_by: user_id,
        }));

      console.log('UpdaeDto', updateOrderDto);
      const { data: order } = await this.findOne(id);

      if (!order) throw new NotFoundException('Order not found');

      const orderdetailsIds = updateOrderDto.order_details
        ? updateOrderDto.order_details
            .filter((x) => Boolean(x.id))
            .map((x) => x.id)
        : undefined;

      console.log('Provide Details', orderdetailsIds);

      const orderDetail = await this.dbService.m_order_details.findMany({
        where: {
          id: {
            in: orderdetailsIds,
          },
        },
        include: {
          item: {
            include: {
              category: true,
              prices: {
                where: {
                  periodic_start: { lte: new Date() },
                  periodic_end: { gte: new Date() },
                },
              },
            },
          },
        },
      });

      const whereItems = updateOrderDto.order_details
        ? {
            id: {
              in: updateOrderDto.order_details
                .filter((x) => Boolean(x.item_id))
                .map((x) => x.item_id),
            },
          }
        : undefined;

      const items = await this.dbService.items.findMany({
        where: {
          ...whereItems,
        },
        include: {
          category: true,
          prices: {
            where: {
              periodic_start: { lte: new Date() },
              periodic_end: { gte: new Date() },
            },
          },
        },
      });

      if (updateOrderDto.order_details) {
        const checkOrderDetailIds = orderdetailsIds.filter(
          (x) => !orderDetail.some((y) => x === y.id),
        );

        if (checkOrderDetailIds.length)
          throw new NotFoundException({
            messages: 'The provided detail id not found',
            errorIds: checkOrderDetailIds,
          });
      }

      const searchStatusInput = updateOrderDto.project_status_id
        ? await this.dbService.status.findFirst({
            where: {
              id: updateOrderDto.project_status_id,
            },
          })
        : null;

      let projectStatusDefault = order.status;

      if (
        searchStatusInput &&
        searchStatusInput.category === 'BOOKED' &&
        order.status.category === 'PICKLIST' &&
        currentUser.roles.name.toLowerCase().includes('cs')
      ) {
        projectStatusDefault = searchStatusInput;
      }
      if (
        searchStatusInput &&
        searchStatusInput.category === 'BOOKED' &&
        order.status.category === 'BOOK' &&
        currentUser.roles.name.toLowerCase().includes('admin ho')
      ) {
        await this;
        projectStatusDefault = searchStatusInput;
      }

      if (
        searchStatusInput &&
        searchStatusInput.category === 'SURVEYREQ' &&
        order.status.category === 'BOOKED' &&
        updateOrderDto.vendor_id
      ) {
        projectStatusDefault = searchStatusInput;
      }

      if (
        searchStatusInput &&
        searchStatusInput.category === 'SURVEYSTART' &&
        order.status.category === 'SURVEYREQ'
      ) {
        projectStatusDefault = searchStatusInput;
      }

      const salesUser = await this.dbService.sales.findFirst({
        where: {
          id: order.sales_id,
        },
        include: {
          sales_categories: true,
        },
      });
      console.log('Order Detail', orderDetail);

      let grand_total = 0;
      let grand_total_comission = 0;

      const orderDetailUpsert: Prisma.m_order_detailsUpsertWithWhereUniqueWithoutOrderInput[] =
        updateOrderDto.order_details
          ? updateOrderDto.order_details.map((item) => {
              let total = 0;
              const currentItem = items?.find(({ id }) => id === item?.item_id);

              console.log('Details Item', items);
              console.log('Current Item', currentItem);

              const itemPrice =
                currentItem?.prices.filter(
                  (x) => item.quantity >= x.min_order,
                )?.[0]?.price ??
                currentItem?.default_price ??
                0;

              // console.log(currentItem.default_price);

              // const comission = Number(
              //   salesUser?.sales_categories?.find(
              //     ({ category_id }) => currentItem?.category_id === category_id,
              //   )?.commission ?? salesUser?.sales_categories?.find(
              //     ({ category_id }) => item.category_id === category_id,
              //   )?.commission,
              // );

              const comission = Number(
                salesUser?.sales_categories?.find(
                  ({ category_id }) => currentItem?.category_id === category_id,
                )?.commission ?? 0,
              );

              if (
                [PAYMENT_TYPE.PEMASANGAN_TANPA_SURVEY].includes(
                  updateOrderDto.payment_type,
                )
              ) {
                total = Number(itemPrice) * item.quantity;
                grand_total +=
                  total +
                  (updateOrderDto.additional_fee
                    ? Number(updateOrderDto.additional_fee) -
                      +order.additional_fee
                    : 0);
                grand_total_comission += comission;
              } else {
                grand_total +=
                  Number(order.grand_total) +
                  (updateOrderDto.additional_fee
                    ? Number(updateOrderDto.additional_fee) -
                      +order.additional_fee
                    : 0);
              }

              return {
                where: { id: item?.id ?? 0, order_id: id },
                update: {
                  item_notes: item?.item_notes,
                  item_name: item?.item_name ?? '',
                  item_code: item?.item_code ?? '',
                  item_id: item?.item_id ?? undefined,
                  quantity: item?.quantity,
                  unit_price: itemPrice,
                  total,
                  comission,
                  updated_by: user_id,
                  updated_at: new Date(),
                },
                create: {
                  item_notes: item?.item_notes,
                  ...(item.item_id
                    ? {
                        item: {
                          connect: {
                            id: item.item_id,
                          },
                        },
                      }
                    : undefined),
                  sales: {
                    connect: { id: updateOrderDto.sales_id ?? order.sales_id },
                  },
                  item_name: item?.item_name ?? '',
                  item_code: item?.item_code ?? '',
                  quantity: item?.quantity,
                  unit_price: itemPrice,
                  total,
                  comission,
                  created_by: user_id,
                  created_at: new Date(),
                },
              };
            })
          : undefined;

      console.log(grand_total);

      const orderUpdateData: Prisma.ordersUncheckedUpdateInput = {
        notes: updateOrderDto?.notes ?? undefined,
        additional_fee: updateOrderDto?.additional_fee ?? undefined,
        member_id: updateOrderDto?.member_id ?? undefined,
        store_id: updateOrderDto?.store_id ?? undefined,
        vendor_id: updateOrderDto?.vendor_id ?? undefined,
        project_address: updateOrderDto?.project_address ?? undefined,
        receipt_number: updateOrderDto?.receipt_number ?? undefined,
        grand_total: grand_total,
        grand_total_comission: grand_total_comission,
        updated_by: user_id,
        payment_type: updateOrderDto?.payment_type ?? undefined,
        project_status_id: updateOrderDto?.project_status_id ?? undefined,
        print_counter: 0,
        updated_at: new Date(),
        request_survey: updateOrderDto?.request_survey
          ? new Date(updateOrderDto?.request_survey ?? undefined)
          : undefined,
        order_files: {
          createMany: {
            data: files,
          },
        },
      };

      const deletedDetailsId = updateOrderDto.order_details
        ? updateOrderDto.order_details
            .filter((x) => Boolean(x?.id))
            .map((item) => {
              return item.id;
            })
        : undefined;
      const deletedOrderFile = updateOrderDto.existing_order_files
        ? updateOrderDto?.existing_order_files
            .filter((x) => Boolean(x?.order_file_id))
            .map((item) => {
              return Number(item.order_file_id);
            })
        : undefined;

      const [syncDetails, syncFiles, orderQuery] =
        await this.dbService.$transaction([
          this.dbService.m_order_details.updateMany({
            where: {
              order_id: id,
              ...(deletedDetailsId && deletedDetailsId.length
                ? {
                    id: {
                      notIn: deletedDetailsId,
                    },
                  }
                : undefined),
            },
            data: {
              deleted_at: new Date(),
              deleted_by: user_id,
            },
          }),
          this.dbService.order_files.updateMany({
            where: {
              ...(deletedOrderFile
                ? {
                    id: {
                      notIn: deletedOrderFile,
                    },
                  }
                : undefined),
              order_id: id,
            },
            data: {
              deleted_at: new Date(),
              deleted_by: user_id,
            },
          }),
          this.dbService.orders.update({
            where: {
              id: order.id,
            },
            data: {
              ...orderUpdateData,
              ...(updateOrderDto.order_details
                ? {
                    m_order_details: {
                      upsert: orderDetailUpsert,
                    },
                  }
                : undefined),
            },
            include: {
              status: true,
            },
          }),
        ]);

      await this.addHistory(
        orderQuery.id,
        orderQuery.project_status_id,
        user,
        updateOrderDto,
      );

      return orderQuery;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async remove(id: number) {
    return `This action removes a #${id} order`;
  }

  async counter(id: number) {
    try {
      const order = await this.dbService.orders.findFirst({
        where: {
          id,
        },
      });

      if (!order) throw new NotFoundException('Order not found');

      this.dbService.$transaction([
        this.dbService.orders.update({
          where: {
            id,
          },
          data: {
            print_counter: order.print_counter + 1,
          },
        }),
      ]);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkStatus() {
    try {
      const status = await this.dbService.status.findFirst({
        where: {
          category: {
            contains: 'BOOK',
          },
        },
      });

      const statusUnpaid = await this.dbService.status.findFirst({
        where: {
          category: {
            contains: 'UNPAID',
          },
        },
      });

      const date = new Date();
      const thirdDateTime = new Date(date.setDate(date.getDate() - 3));
      const orders = await this.dbService.orders.updateMany({
        where: {
          status: {
            id: status.id,
          },
          created_at: {
            lt: thirdDateTime,
          },
        },
        data: {
          project_status_id: statusUnpaid.id,
        },
      });

      // return orders;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async deleteOrder() {
    try {
      const status = await this.dbService.status.findFirst({
        where: {
          category: {
            contains: 'PICKLIST',
          },
        },
      });

      

      const orders = await this.dbService.orders.deleteMany({
        where: {
          status: {
            id: status.id,
          } 
        }
      });

      // return orders;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
  async setStatus(id: number, status_id: number, user: users) {
    try {
      const order = await this.findOne(id);

      if (!order) throw new BadRequestException('Order does not Exist!');
      const [STATUS] = await this.dbService.status.findMany({
        where: {
          id: status_id,
        },
        orderBy: {
          category: 'desc',
        },
      });
      const orderData: Prisma.ordersUpdateInput = {
        status: {
          connect: {
            id: STATUS.id,
          },
        },
      };

      const [orders] = await this.dbService.$transaction([
        this.dbService.orders.update({
          where: {
            id,
          },
          data: orderData,
        }),
      ]);
      await this.addHistory(orders.id, orders.project_status_id, user, orders);

      return orders;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  // TODO: type-def for payload only order ...
  async addHistory(
    id: number,
    status_id: number,
    user: users,
    payload: any,
  ): Promise<void> {
    try {
      // TODO: THE ORDER HISTORY FUNCTION ...
      // TODO: SAVE THE PAYLOAD TO THE HISTORY TABLE ...
      // JSON.stringify(payload)

      await this.dbService.order_histories.create({
        data: {
          order_id: id,
          status_id: status_id,
          payload: JSON.stringify(payload),
          created_by: user.id,
        },
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async orderDetailsPublic(query: QueryParamsDto) {
    try {
      let { order_id, phone_number, email_member, member_number } = query;

      const member = await this.dbService.members.findFirst({
        where: {
          phone_number: phone_number,
        },
      });
      if (member_number && !member) {
        if (member_number.startsWith('08')) {
          member_number = member_number.slice(1);
        } else if (member_number.startsWith('628')) {
          member_number = member_number.slice(2);
        }
      }
      const where: Prisma.ordersWhereInput = {
        id: +order_id,
        OR: [
          ...(email_member
            ? [
                {
                  members: {
                    email: email_member,
                  },
                },
              ]
            : []),
          ...(member_number
            ? [
                {
                  members: {
                    member_number: member_number,
                  },
                },
              ]
            : []),
          ...(phone_number
            ? [
                {
                  members: {
                    member_number: phone_number,
                    // phone_number: phone_number,
                  },
                },
              ]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      const order = await this.dbService.orders.findFirst({
        where,
        include: {
          members: true,
          sales: true,
          status: true,
          vendor: true,
          store: true,
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
                  prices: true,
                  default_price: true,
                  service_name: true,
                },
              },
              unit_price: true,
              quantity: true,
              total: true,
              comission: true,
              created_by: true,
              updated_by: true,
              created_at: true,
              updated_at: true,
            },
          },
          quotation: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            include: {
              quotation_details: {
                include: {
                  item: true,
                },
              },
              promotion: true,
              quotation_files: true,
            },
          },
          order_files: true,
          complaints: true,
          work_orders: {
            include: {
              vendor: true,
              work_order_evidences: true,
              work_order_tukang: {
                include: {
                  tukang: true,
                },
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
              work_order_status: {
                include: {
                  status: true,
                  work_order_items: {
                    include: {
                      item: true,
                    },
                    where: {
                      deleted_at: null,
                      deleted_by: null,
                    },
                  },
                },
                orderBy: {
                  created_at: 'desc',
                },
              },
            },
          },
        },
      });

      if (!order) throw new NotFoundException('Order not found !');

      const redirect_url = `${
        process.env.FE_URL
      }/detail-order?order_id=${order_id}${
        phone_number ? `&phone_number=${phone_number}` : ''
      }${email_member ? `&email_member=${email_member}` : ''}${
        member_number ? `&member_number=${member_number}` : ''
      }`;

      return {
        data: order,
        meta: {
          redirect_url,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async orderExportExcel(res: Response, queryParams: QueryParamsDto) {
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
      } = queryParams;

      const skip = page * take - take;

      const where: Prisma.ordersWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    { receipt_number: { contains: search } },
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
        ].filter(Boolean),
        deleted_at: null,
      };

      const data = await this.dbService.orders.findMany({
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
          invoice_details: {
            where: {
              deleted_at: null,
            },
            select: {
              invoices: {
                select: {
                  id: true,
                  status: true,
                  total_amount: true,
                  invoice_logs: true,
                  description: true,
                  vendor: true,
                },
              },
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
          complaints: true,
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
          order_history: {
            select: {
              order_id: true,
              created_at: true,
              status: {
                select: {
                  id: true,
                  category: true,
                  description: true,
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
          quotation: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            include: {
              promotion: true,
              quotation_details: {
                include: {
                  item: true,
                },
              },
              quotation_files: true,
            },
          },
          work_orders: {
            where: {
              deleted_at: null,
            },
            include: {
              request_tukang: {
                include: {
                  tukang_to_request_tukang: true,
                  tukang_to_replace_tukang: true,
                },
              },
              vendor: true,
              work_order_evidences: true,
              work_order_tukang: {
                include: {
                  tukang: true,
                },
              },
              work_order_status: {
                include: {
                  status: true,
                  work_order_items: {
                    include: {
                      item: true,
                    },
                    where: {
                      deleted_at: null,
                      deleted_by: null,
                    },
                  },
                },
                orderBy: {
                  created_at: 'desc',
                },
              },
            },
          },
          order_files: true,
        },
      });

      // Log data to verify it is fetched correctly
      // console.log('Fetched Data:', data);

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Order', {
        properties: {
          tabColor: {
            argb: 'FF00FF00',
          },
          outlineLevelCol: 2,
          outlineLevelRow: 40,
        },
        pageSetup: {
          margins: {
            left: 90.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3,
          },
        },
      });

      worksheet.columns = [
        { header: 'Order Id', key: 'id', width: 10 },
        { header: 'Tanggal Request', key: 'request_survey', width: 25 },
        { header: 'Nomor Receipt', key: 'receipt_number', width: 30 },
        { header: 'Receipt Quotation', key: 'receipt_quotation', width: 30 },
        { header: 'Payment Type', key: 'payment_type', width: 30 },
        { header: 'Order Status', key: 'status_order', width: 30 },
        { header: 'Nama Toko', key: 'store_name', width: 25 },
        { header: 'Nama Pemasangan', key: 'item_name', width: 30 },
        { header: 'Category', key: 'category_name', width: 30 },
        { header: 'Nomor Member', key: 'member_number', width: 20 },
        { header: 'Nama Customer', key: 'full_name', width: 25 },
        { header: 'Phone Number', key: 'whatsapp_number', width: 30 },
        { header: 'WA Number', key: 'phone_number', width: 30 },
        { header: 'Nama Vendor', key: 'company_name', width: 35 },
        { header: 'Nama Sales', key: 'sales_name', width: 35 },
        { header: 'Nama Tukang', key: 'tukang_name', width: 30 },
        { header: 'Order Dibuat ', key: 'created_at', width: 30 },
        { header: 'Grand Total Survey', key: 'grand_total_survey', width: 30 },
        {
          header: 'Quotation Grand Total ',
          key: 'quotation_grand_total',
          width: 30,
        },
        { header: 'Grand Total', key: 'grand_total', width: 25 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '0000FF' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
      let totalGrandTotalValue = 0;

      data.forEach((order) => {
        const itemName = order.m_order_details
          ? order.m_order_details
              .map((item) => item?.item_name || '-')
              .join(', ')
          : 'Item belum ditentukan';
        const categoryName = order.m_order_details
          ? order.m_order_details
              .map((item) => item.item?.category?.category_name || '-')
              .join(', ')
          : 'Category Belum ditentukan';
        const tukangName = order?.work_orders?.work_order_tukang
          ? [
              ...new Set(
                order.work_orders.work_order_tukang.map(
                  (item) => item?.tukang?.full_name,
                ),
              ),
            ].join(', ')
          : 'Tukang belum ditugaskan';
        const formattedDateTime = (dateTime) =>
          `${new Date(dateTime).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${new Date(dateTime).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        const grandTotal = Number(order.grand_total);
        const formattedGrandTotal: number = grandTotal ? grandTotal : 0;
        let grandTotalValue = formattedGrandTotal;

        if (order.payment_type === 'survey') {
          const grandTotalSurvey = Number(order.grand_total);
          const quotationGrandTotal =
            order && order.quotation && order.quotation.length > 0
              ? Number(order.quotation[0]?.quotation_grand_total || 0)
              : 0;

          if (!isNaN(grandTotalSurvey) && !isNaN(quotationGrandTotal)) {
            totalGrandTotalValue += grandTotalSurvey + quotationGrandTotal;
            grandTotalValue = grandTotalSurvey + quotationGrandTotal;
          } else {
            grandTotalValue = 0;
          }
        }

        totalGrandTotalValue +=
          !isNaN(Number()) && order.payment_type != 'survey'
            ? Number(grandTotal)
            : 0;

        const row = worksheet.addRow({
          id: order.id,
          request_survey: order.request_survey
            ? formattedDateTime(order.request_survey)
            : 'N/a',
          receipt_quotation:
            order.payment_type === 'survey' &&
            order?.quotation[0]?.receipt_quotation
              ? order?.quotation[0]?.receipt_quotation
              : 'Receipt Quotation tidak ada',
          receipt_number: order.receipt_number
            ? order.receipt_number
            : 'Receipt belum terbit',
          payment_type:
            order.payment_type === 'pemasangan_tanpa_survey'
              ? 'Pemasangan Tanpa Survey'
              : order.payment_type === 'survey'
              ? 'Survey'
              : order.payment_type === 'gratis'
              ? 'Gratis'
              : 'N/a',
          status_order:
            order?.status?.description ?? 'Order Tidak Memiliki Status',
          store_name: order.store ? order.store.store_name : 'N/a',
          item_name: itemName,
          category_name: categoryName,
          member_number: order.members
            ? order.members.member_number
            : 'Member tidak memiliki nomor member',
          full_name: order.members ? order.members.full_name : 'N/a',
          whatsapp_number: order.members.whatsapp_number
            ? order.members.whatsapp_number
            : 'Member tidak memiliki nomor whastapp',
          phone_number: order.members.phone_number
            ? order.members.phone_number
            : 'Member tidak memiliki nomor telepon',
          company_name: order.vendor ? order.vendor.company_name : 'N/a',
          sales_name: order.sales ? order.sales.full_name : 'N/a',
          tukang_name: tukangName,
          created_at: formattedDateTime(order.created_at),
          grand_total_survey:
            order.payment_type === 'survey' ? formattedGrandTotal : 0,
          quotation_grand_total:
            order.quotation && order.payment_type === 'survey'
              ? Number(order?.quotation[0]?.quotation_grand_total) || 0
              : 0,
          grand_total: grandTotalValue,
        });

        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      });

      // Setelah selesai iterasi, format totalGrandTotalValue menjadi format mata uang yang diinginkan

      // Gunakan formattedTotalGrandTotalValue untuk membuat baris total seperti yang Anda lakukan sebelumnya di dalam worksheet
      const totalRow = worksheet.addRow({
        id: 'Total',
        store_name: '',
        member_number: '',
        full_name: '',
        project_number: '',
        company_name: '',
        sales_name: '',
        receipt_quotation: '',
        receipt_number: '',
        payment_type: '',
        status_order: '',
        item_name: '',
        category_name: '',
        tukang_name: '',
        created_at: '',
        grand_total_survey: '',
        quotation_grand_total: '',
        grand_total: Number(totalGrandTotalValue), // Gunakan total yang sudah diformat di sini
      });

      totalRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      totalRow.height = 30;

      worksheet.mergeCells(`A${totalRow.number}:R${totalRow.number}`);

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/order';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const now = Date.now();

        const excelFileName = `${baseName}-${now}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      const writeWorkbookAndSendResponse = async (
        workbook: exceljs.Workbook,
        excelFilePath: string,
        res: Response,
      ) => {
        await workbook.xlsx.writeFile(excelFilePath);

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=${path.basename(excelFilePath)}`,
        );

        const fileStream = fs.createReadStream(excelFilePath);
        fileStream.pipe(res);
      };

      const generateExcelFile = async (res) => {
        const formattedDate = getFormattedDate();
        const baseName = `DataOrder-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return await generateExcelFile(res);
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }

  async orderCalender(queryParams: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        status,
        date_from,
        date_to,
        sales_id,
        payment_type,
        store_id,
        vendor_id,
        work_order_status,
        vendor,
      } = queryParams;

      const skip = page * take - take;

      const where: Prisma.ordersWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    { receipt_number: { contains: search } },
                    // TODO: FIXME
                    // { request_survey: { equals: new Date(search) } },
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
          vendor
            ? {
                vendor: {
                  id: {
                    in: vendor,
                  },
                  deleted_at: null,
                },
              }
            : undefined,
          ...(date_from && date_to
            ? [
                {
                  OR: [
                    {
                      work_orders: {
                        AND: [
                          { survey_date: { gte: new Date(date_from) } },
                          {
                            survey_date: {
                              lte: new Date(`${date_to}T23:59:59.000Z`),
                            },
                          },
                          { work_start_date: null },
                        ],
                      },
                    },
                    {
                      work_orders: {
                        AND: [
                          { work_start_date: { gte: new Date(date_from) } },
                          {
                            work_end_date: {
                              lte: new Date(`${date_to}T23:59:59.000Z`),
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              ]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };
      const orders = await this.dbService.orders.findMany({
        skip,
        take: take > 0 ? take : undefined,
        where,
        orderBy: [
          {
            status: {
              status_urgency: 'desc',
            },
          },
        ],
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
          invoice_details: {
            where: {
              deleted_at: null,
            },
            select: {
              invoices: {
                select: {
                  id: true,
                  status: true,
                  total_amount: true,
                  invoice_logs: true,
                  description: true,
                  vendor: true,
                },
              },
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
            where: {
              deleted_at: null,
              deleted_by: null,
            },
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
              status_urgency: true,
            },
          },
          complaints: true,
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
          quotation: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            include: {
              promotion: true,
              quotation_details: {
                include: {
                  item: true,
                },
              },
              quotation_files: true,
            },
          },
          work_orders: {
            include: {
              request_tukang: {
                include: {
                  tukang_to_request_tukang: true,
                  tukang_to_replace_tukang: true,
                },
              },
              vendor: true,
              work_order_evidences: true,
              work_order_tukang: {
                include: {
                  tukang: true,
                },
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
              work_order_status: {
                include: {
                  status: true,
                  work_order_items: {
                    include: {
                      item: true,
                    },
                    where: {
                      deleted_at: null,
                      deleted_by: null,
                    },
                  },
                },
                orderBy: {
                  created_at: 'desc',
                },
              },
            },
          },
          order_files: true,
        },
      });
      console.log(orders);

      const count = await this.dbService.orders.count({
        where,
      });

      return {
        data: orders,
        meta: {
          total: count,
          page,
          take,
          takeTotal: orders.length,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async orderExportExcelHO(res: Response, queryParams: QueryParamsDto) {
    try {
      const { data } = await this.findAll(queryParams);

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Order', {
        properties: {
          tabColor: {
            argb: 'FF00FF00',
          },
          outlineLevelCol: 2,
          outlineLevelRow: 40,
        },
        pageSetup: {
          margins: {
            left: 90.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3,
          },
        },
      });

      worksheet.columns = [
        { header: 'Order Id', key: 'id', width: 10 },
        { header: 'Nama Toko', key: 'store_name', width: 35 },
        { header: 'Nama Customer', key: 'full_name', width: 35 },
        { header: 'Alamat', key: 'address', width: 40 },
        { header: 'Nomor Telepon Customer', key: 'member_number', width: 35 },
        { header: 'Jenis Pengerjaan', key: 'payment_type', width: 30 },
        { header: 'Nama Tukang', key: 'tukang_name', width: 40 },
        { header: 'Order Dibuat ', key: 'created_at', width: 30 },
        { header: 'Tanggal Request Survey', key: 'request_survey', width: 30 },
        {
          header: 'Tanggal Permintaan Survey',
          key: 'surveyreq_date',
          width: 30,
        },
        {
          header: 'Tanggal Survey Dimulai',
          key: 'surveystart_date',
          width: 30,
        },
        { header: 'Tanggal Survey Selesai', key: 'surveyend_date', width: 30 },
        {
          header: 'Tanggal Permintaan Pengerjaan',
          key: 'workreq_date',
          width: 30,
        },
        {
          header: 'Tanggal Pengerjaan Dimulai',
          key: 'workstart_date',
          width: 30,
        },
        {
          header: 'Tanggal Pengerjaan Berakhir',
          key: 'workend_date',
          width: 30,
        },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '0000FF' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      data.forEach((order) => {
        const tukangName = order.work_orders
          ? order.work_orders.work_order_tukang
              .map((item) => item?.tukang?.full_name)
              .join(', ')
          : 'N/a';
        const formattedDateTime = (dateTime) =>
          `${new Date(dateTime).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${dateTime.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        const grandTotal = Number(order.grand_total);
        const formattedGrandTotal = !isNaN(grandTotal) ? Number(grandTotal) : 0;
        const row = worksheet.addRow({
          id: order.id,
          store_name: order.store ? order.store.store_name : 'N/a',
          full_name: order.members ? order.members.full_name : 'N/a',
          address: order.members.address_1
            ? order.members.address_1
            : order.members.address_2,
          member_number: order.members.phone_number
            ? order.members.phone_number
            : order.members.whatsapp_number,
          payment_type:
            order.payment_type === 'pemasangan_tanpa_survey'
              ? 'Pemasangan Tanpa Survey'
              : order.payment_type === 'survey'
              ? 'Survey'
              : order.payment_type === 'gratis'
              ? 'Gratis'
              : 'N/a',
          tukang_name: tukangName,
          created_at: formattedDateTime(order.created_at),
          request_survey: order.request_survey
            ? formattedDateTime(order.request_survey)
            : 'N/a',
          surveyreq_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('surveyreq'),
          )
            ? formattedDateTime(
                order.order_history.find((i) =>
                  i.status.category.toLowerCase().includes('surveyreq'),
                ).created_at,
              )
            : 'N/a',
          surveystart_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('surveystart'),
          )
            ? formattedDateTime(
                order.order_history.find((i) =>
                  i.status.category.toLowerCase().includes('surveystart'),
                ).created_at,
              )
            : 'N/a',
          surveyend_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('surveyend'),
          )
            ? formattedDateTime(
                order.order_history.find((i) =>
                  i.status.category.toLowerCase().includes('surveyend'),
                ).created_at,
              )
            : 'N/a',
          workreq_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('workreq'),
          )
            ? formattedDateTime(
                order.order_history.find((i) =>
                  i.status.category.toLowerCase().includes('workreq'),
                ).created_at,
              )
            : 'N/a',
          workstart_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('workstart'),
          )
            ? formattedDateTime(
                order.order_history.find((i) =>
                  i.status.category.toLowerCase().includes('workstart'),
                ).created_at,
              )
            : 'N/a',
          workend_date: order.order_history.find((i) =>
            i.status.category.toLowerCase().includes('workend'),
          )
            ? formattedDateTime(
                order.order_history.find((i) =>
                  i.status.category.toLowerCase().includes('workend'),
                ).created_at,
              )
            : 'N/a',
        });

        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      });

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/order';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const now = Date.now();

        const excelFileName = `${baseName}-${now}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      const writeWorkbookAndSendResponse = async (
        workbook: exceljs.Workbook,
        excelFilePath: string,
        res: Response,
      ) => {
        await workbook.xlsx.writeFile(excelFilePath);

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=${path.basename(excelFilePath)}`,
        );

        const fileStream = fs.createReadStream(excelFilePath);
        fileStream.pipe(res);
      };

      const generateExcelFile = async (res) => {
        const formattedDate = getFormattedDate();
        const baseName = `DataOrder-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(res);
    } catch (error) {
      throw error;
    }
  }
}
