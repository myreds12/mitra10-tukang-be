/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from '../common/dto/query-params.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateMemberDto } from 'src/member/dto/create-member.dto';

@Injectable()
export class OrderPublicService {
  private readonly logger = new Logger(OrderPublicService.name);

  constructor(private readonly dbService: PrismaService) {}

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
          order_history: {
            select: {
              order_id: true,
              payload: true,
              created_at: true,
              created_by: true,
              status: {
                select: {
                  id: true,
                  category: true,
                  description: true,
                },
              },
            },
          },
        },
      });

      if (!order) throw new NotFoundException('Order not found!');

      const redirect_url = `${process.env.FE_URL
        }/detail-order?order_id=${order_id}${phone_number ? `&phone_number=${phone_number}` : ''
        }${email_member ? `&email_member=${email_member}` : ''}${member_number ? `&member_number=${member_number}` : ''
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

  async updateReceiptPublic(
    id: number,
    files: { [name: string]: Express.Multer.File[] },
  ) {
    try {
      const { receipt_order, quotation_receipt_customer } = files;

      const receiptQuotationFileCustomer =
        quotation_receipt_customer?.map((file) => ({
          path: file.filename,
          type: 3,
        })) ?? [];

      const receiptOrderFiles =
        receipt_order?.map((file) => ({
          path: file.filename,
          type: 'any',
        })) ?? [];

      const order = await this.dbService.orders.findFirstOrThrow({
        where: {
          id,
          deleted_at: null,
        },
        include: {
          quotation: {
            where: {
              deleted_at: null,
            },
          },
        },
      });

      const result = await this.dbService.$transaction([
        ...(receiptOrderFiles
          ? [
            this.dbService.orders.update({
              where: { id },
              data: {
                order_files:
                  receiptOrderFiles.length > 0
                    ? {
                      createMany: { data: receiptOrderFiles },
                    }
                    : undefined,
              },
              include: {
                quotation: true,
              },
            }),
          ]
          : []),
        ...(receiptQuotationFileCustomer
          ? [
            this.dbService.quotation.update({
              where: {
                id: order?.quotation[0]?.id,
              },
              data: {
                quotation_files: {
                  createMany: {
                    data: receiptQuotationFileCustomer,
                  },
                },
              },
            }),
          ]
          : []),
      ]);

      return result;
    } catch (error) {
      console.error('Error updating receipt public:', error);
      throw new Error('Failed to update receipt public');
    }
  }

  async createOrderPublic(dto: CreateOrderDto, memberDto: CreateMemberDto) {
    try {
      const store = await this.dbService.store.findFirst({
        where: {
          store_name: {
            contains: dto.store_name,
          },
        },
      });

      const member = await this.dbService.members.findFirst({
        where: {
          deleted_at: null,
          email: memberDto?.email ?? undefined,
          full_name: memberDto?.full_name ?? undefined,
        },
      });

      let newMember;
      if (!member) {
        newMember = await this.dbService.members.create({
          data: {
            full_name: memberDto?.full_name ?? undefined,
            email: memberDto?.email ?? undefined,
            phone_number: memberDto?.phone_number ?? undefined,
            whatsapp_number: memberDto?.whatsapp_number ?? undefined,
            member_number:
              memberDto?.phone_number ?? memberDto?.whatsapp_number,
            address_1: memberDto?.address_1 ?? undefined,
            address_2: memberDto?.address_2 ?? undefined,
            area_id: memberDto?.area_id ?? undefined,
            zip_code: memberDto?.zip_code ?? undefined,
            join_date: new Date(),
            join_location: store?.id ?? undefined,
          },
        });
      }

      const requestedItemCodes = (dto?.order_details || [])
        .map((x) => x?.item_code)
        .filter((code): code is string => Boolean(code));

      const items =
        requestedItemCodes.length > 0
          ? await this.dbService.items.findMany({
              where: {
                deleted_at: null,
                item_code: { in: requestedItemCodes },
              },
              include: {
                category: true,
                prices: {
                  where: {
                    deleted_at: null,
                    is_active: true,
                    OR: [
                      { periodic_end: { gte: new Date() } },
                      { periodic_end: null },
                    ],
                  },
                },
              },
            })
          : [];

      const foundItemCodes = new Set(items.map((item) => item.item_code));
      const missingItems = requestedItemCodes.filter(
        (code) => !foundItemCodes.has(code),
      );

      if (missingItems.length > 0) {
        throw new NotFoundException(
          `Item tidak ditemukan: ${missingItems.join(', ')}`,
        );
      }

      const itemTypes = new Set(items.map((item) => item.type));
      if (itemTypes.size > 1) {
        throw new BadRequestException(
          'Tipe item berbeda ditemukan dalam daftar item yang diminta.',
        );
      }

      const itemType = items[0]?.type;
      let payment_type;
      switch (itemType) {
        case 1:
          payment_type = 'gratis';
          break;
        case 2:
          payment_type = 'pemasangan_tanpa_survey';
          break;
        case 3:
          payment_type = 'survey';
          break;
        default:
          throw new BadRequestException('Tipe item tidak valid.');
      }

      const bookedStatus = await this.dbService.status.findFirst({
        where: {
          category: 'BOOKED',
        },
      });

      let grand_total = 0;
      if (payment_type === 'survey') grand_total += 99000;

      const order_details: Prisma.m_order_detailsCreateManyOrderInput[] =
        dto.order_details.map((item) => {
          let total = 0;
          const currentItem = items.find(
            ({ item_code }) => item_code === item?.item_code,
          );
          const itemPrice =
            currentItem?.prices.filter((x) => item.quantity >= x.min_order)?.[0]
              ?.price ??
            currentItem?.default_price ??
            0;

          if (payment_type === 'pemasangan_tanpa_survey') {
            total = Number(itemPrice) * item.quantity;
            grand_total += total;
          }

          return {
            item_id: currentItem?.id,
            item_name: currentItem?.service_name ?? currentItem?.item_name,
            item_code: currentItem?.item_code,
            quantity: item?.quantity,
            item_notes: item?.item_notes,
            unit_price: itemPrice,
            comission: 0,
            total,
          };
        });

      const orderConnection = Object.fromEntries(
        Object.entries({
          members: { connect: { id: member ? member.id : newMember.id } },
          store: { connect: { id: store.id } },
          status: { connect: { id: bookedStatus.id } },
        }).filter(([value]) => value !== undefined),
      );

      const orderData = {
        notes: dto?.notes ?? undefined,
        project_address: member ? member?.address_1 : newMember.address_1,
        project_number: member
          ? member?.phone_number ?? member?.whatsapp_number ?? undefined
          : newMember?.phone_number ?? newMember?.whatsapp_number ?? undefined,
        receipt_number: dto?.receipt_number ?? undefined,
        grand_total: grand_total.toFixed(2),
        payment_type,
        print_counter: 0,
        request_survey: new Date(dto?.request_survey),
      };

      const ordersOptions: Prisma.ordersCreateArgs = {
        data: {
          ...orderConnection,
          ...orderData,
          m_order_details: { createMany: { data: order_details } },
        },
        include: {
          status: true,
        },
      };

      const [order] = await this.dbService.$transaction([
        this.dbService.orders.create({
          data: {
            ...ordersOptions.data,
          },
          select: {
            id: true,
            member_id: true,
            members: {
              select: {
                id: true,
                full_name: true,
                email: true,
                phone_number: true,
                whatsapp_number: true,
                address_1: true,
                address_2: true,
                area_id: true,
                zip_code: true,
                join_date: true,
                join_location: true,
              },
            },
            store_id: true,
            store: {
              select: {
                id: true,
                store_name: true,
                address: true,
              },
            },
            receipt_number: true,
            project_address: true,
            project_number: true,
            m_order_details: {
              select: {
                id: true,
                item_id: true,
                item_name: true,
                item_code: true,
                item: {
                  select: {
                    item_code: true,
                    item_name: true,
                    service_name: true,
                    default_price: true,
                    prices: {
                      select: {
                        price: true,
                        min_order: true,
                      },
                    },
                  },
                },
                quantity: true,
                item_notes: true,
                unit_price: true,
                comission: true,
                total: true,
              },
            },
            request_survey: true,
            grand_total: true,
            project_status_id: true,
            status: {
              select: {
                id: true,
                category: true,
              },
            },
            work_orders: {
              include: {
                work_order_tukang: true,
              },
            },
            created_at: true,
          },
        }),
      ]);
      return order;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
}
