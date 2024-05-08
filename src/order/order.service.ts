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
import { QueryParamsDto } from './dto/query-params.dto';
import { StatusService } from 'src/status/status.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Item } from 'src/items/entities/item.entity';
import { SendEmailService } from 'src/mails/send-email.service';

@Injectable()
export class OrderService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly statusService: StatusService,
  ) {}

  async create(
    createOrderDto: CreateOrderDto,
    user: users,
    order_files: Array<Express.Multer.File>,
  ) {
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
        id: { in: createOrderDto.order_details.map(({ item_id }) => item_id) },
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
    console.log(orderDetailItems, 'Details Item');

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
        category: { equals: role_id === STORE_ROLES.id ? 'picklist' : 'book' },
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
          [PAYMENT_TYPE.PEMASANGAN_TANPA_SURVEY].includes(
            createOrderDto.payment_type,
          )
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

    return order;
  }

  async findAll(queryParams: QueryParamsDto, users: users) {
    const { id: user_id, role_id } = users;
    // DO SEARCH AND PAGINATION LOGIC ...
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
      invoice_status,
    } = queryParams;
    // const user = await this.dbService.users.findFirst({
    //   where: {
    //     id: user_id,
    //     role_id
    //   }
    // });
    const skip = page * take - take;
    let statusDone = await this.dbService.status.findMany();

    statusDone = statusDone.filter(({ category }) => category === 'DONE');

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
    console.log(JSON.stringify(where));

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
        invoice_orders: {
          select: {
            id: true,
            invoice_id: true,
            invoices: true,
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
            user_id: true,
            company_name: true,
            address: true,
            phone_number: true,
            ktp_number: true,
            npwp_number: true,
            email_address: true,
            join_date: true,
            is_active: true,
            created_at: true,
            updated_at: true,
            created_by: true,
            updated_by: true,
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
          },
        },
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
        order_files: true,
      },
    });
    const count = await this.dbService.orders.count({
      where,
    });

    return {
      data: orders,
      total: count,
      page,
      take,
      // orderGrandTotal,
      takeTotal: orders.length,
      // monthlyOrders,
    };
  }

  async findOne(id: number) {
    const orders = await this.dbService.orders.findFirst({
      where: {
        id,
        deleted_at: null,
      },
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
            updated_by: true,
            created_at: true,
            updated_at: true,
          },
        },
        order_files: {
          where: {
            deleted_at: null,
          },
        },
        invoice_orders: {
          select: {
            id: true,
            invoice_id: true,
            invoices: true,
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
            quotation_details: true,
          },
        },
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

    const data = {
      ...orders,
    };

    data['order_details'] = data.m_order_details;
    delete data.m_order_details;

    return data;
  }

  async update(
    id: number,
    updateOrderDto: UpdateOrderDto,
    user?: users,
    order_files?: Express.Multer.File[],
  ) {
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
    const order = await this.findOne(id);

    if (!order) throw new NotFoundException('Order not found');

    const providedDetailIds = updateOrderDto.order_details
      .filter((x) => Boolean(x.id))
      .map((x) => x.id);

    console.log('Provide Details', providedDetailIds);

    const orderDetail = await this.dbService.m_order_details.findMany({
      where: {
        id: {
          in: providedDetailIds,
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

    const items = await this.dbService.items.findMany({
      where: {
        id: {
          in: updateOrderDto.order_details
            .filter((x) => Boolean(x.item_id))
            .map((x) => x.item_id),
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

    const checkOrderDetailIds = providedDetailIds.filter(
      (x) => !orderDetail.some((y) => x === y.id),
    );

    if (checkOrderDetailIds.length)
      throw new NotFoundException({
        messages: 'The provided detail id not found',
        errorIds: checkOrderDetailIds,
      });

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
      updateOrderDto.order_details.map((item) => {
        let total = 0;
        const currentItem = items?.find(({ id }) => id === item?.item_id);

        console.log('Details Item', items);
        console.log('Current Item', currentItem);

        const itemPrice =
          currentItem?.prices.filter((x) => item.quantity >= x.min_order)?.[0]
            ?.price ??
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
          grand_total += total;
          grand_total_comission += comission;
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
      });

    const orderUpdateData: Prisma.ordersUncheckedUpdateInput = {
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
      .filter((x) => Boolean(x?.id))
      .map((item) => {
        return item.id;
      });
    const deletedOrderFile = updateOrderDto.existing_order_files
      ? updateOrderDto?.existing_order_files
          .filter((x) => Boolean(x?.order_file_id))
          .map((item) => {
            return Number(item.order_file_id);
          })
      : undefined;
    console.log(deletedOrderFile);

    // ...deletedDetailsId.length ?
    //        null :  id: {
    //         notIn: updateOrderDto.order_details
    //           .filter((x) => Boolean(x?.id))
    //           .map((item) => {
    //             return item.id;
    //           }),
    //       },
    // await this.dbService.orders.update({
    //   where: {
    //     id: order.id,
    //   },
    //   data: {
    //     ...orderUpdateData,
    //     m_order_details: {
    //       upsert: orderDetailUpsert,
    //     },
    //   },
    // });
    // return console.log("success");

    const [syncDetails, syncFiles, orderQuery] =
      await this.dbService.$transaction([
        this.dbService.m_order_details.updateMany({
          where: {
            order_id: id,
            ...(deletedDetailsId.length
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
            m_order_details: {
              upsert: orderDetailUpsert,
            },
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
  }

  async remove(id: number) {
    return `This action removes a #${id} order`;
  }

  async counter(id: number) {
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
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkStatus() {
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
    console.log(orders, thirdDateTime);

    return orders;
  }

  async setStatus(id: number, status_id: number, user: users) {
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
  }

  // TODO: type-def for payload only order ...
  async addHistory(
    id: number,
    status_id: number,
    user: users,
    payload: any,
  ): Promise<void> {
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
  }

  async orderDetailsPublic(query: QueryParamsDto) {
    const { order_id, phone_number, email_member, member_number } = query;

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
                  phone_number: phone_number,
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
    }${email_member ? `&email_member=${email_member}` : ''}`;

    return {
      data: order,
      redirect_url,
    };
  }
}
