/* eslint-disable prettier/prettier */
import {
  Injectable,
  HttpStatus,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { CreateSalesDto } from './dto/create-sales.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, roles, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { hash, hashSync } from 'bcrypt';
import { AuthService } from 'src/auth/auth.service';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Response } from 'express';
import { NotificationsService } from 'src/notifications/notifications.service';
import { SalesExportService } from './sales-export.service';
import { SalesManagementService } from './sales-management.service';

@Injectable()
export class SalesService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly authService: AuthService,
    private notifService: NotificationsService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly exportService: SalesExportService,
    private readonly managementService: SalesManagementService,
  ) {}

  async getCode() {
    try {
      const sales = await this.dbService.sales.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return sales[0] || null;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async create(createSalesDto: CreateSalesDto, user: users) {
    try {
      const { id: user_id } = user;
      let bank = null;
      if (createSalesDto.bank_id) {
        bank = await this.dbService.bank.findFirst({
          where: {
            id: createSalesDto.bank_id,
          },
        });

        if (bank.is_active == false)
          throw new HttpException(
            'Bank is not available',
            HttpStatus.BAD_REQUEST,
          );
      }

      const store = await this.dbService.store.findFirst({
        where: {
          id: createSalesDto.store_id,
        },
      });

      const SALES_ROLES = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'sales',
          },
        },
      });

      let sales_categories: Prisma.sales_categoriesCreateManyInput[];

      if (createSalesDto.sales_categories?.length > 0)
        sales_categories = createSalesDto.sales_categories.map((item) => {
          return {
            category_id: item.category_id,
            commission: item.commission ?? '0',
            created_by: user_id,
          };
        });

      const saltedPassword = hashSync(
        createSalesDto?.password ?? 'password',
        12,
      );

      const formattedUsername =
        createSalesDto?.username.replace(/ /g, '_') ?? null;

      const sales_data: Prisma.salesCreateInput = {
        full_name: createSalesDto.full_name,
        bank_branch: createSalesDto?.bank_branch,
        account_name: createSalesDto?.account_name,
        phone_number: createSalesDto?.phone_number,
        account_number: createSalesDto?.account_number,
        sales_brand: createSalesDto?.sales_brand,
        created_by: user_id,
        nik: createSalesDto?.nik,
        store: {
          connect: {
            id: createSalesDto?.store_id ?? undefined,
          },
        },
        bank: bank
          ? {
              connect: {
                id: createSalesDto.bank_id,
              },
            }
          : undefined,
        sales_categories: sales_categories?.length
          ? {
              createMany: {
                data: sales_categories,
              },
            }
          : undefined,
        users: {
          connectOrCreate: {
            where: {
              username:
                formattedUsername ??
                `${createSalesDto.full_name
                  .toLowerCase()
                  .replace(/ /g, '_')}_${store.store_name
                  .toLowerCase()
                  .replace(/ /g, '_')}`,
              id: 0,
            },
            create: {
              username:
                formattedUsername ??
                `${createSalesDto.full_name
                  .toLowerCase()
                  .replace(/ /g, '_')}_${store.store_name
                  .toLowerCase()
                  .replace(/ /g, '_')}`,
              password: saltedPassword,
              role_id: SALES_ROLES.id,
            },
          },
        },
      };

      const [sales] = await this.dbService.$transaction([
        this.dbService.sales.create({
          data: { ...sales_data },
          include: {
            users: true,
          },
        }),
      ]);
      this.emailQueue.add(
        'send-credential-mail',
        {
          username: sales?.users.username,
          password: createSalesDto?.password ?? 'password',
        },
        {
          attempts: 3,
        },
      );

      return sales;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const {
        search,
        take,
        page,
        is_active,
        date_from,
        date_to,
        top_best,
        store_id,
        order_date_from,
        order_date_to,
        is_promotion,
      } = query;

      const skip = page * take - take;
      const where: Prisma.salesWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    {
                      id: !isNaN(+search) ? +search : undefined,
                    },
                    { full_name: { contains: search } },
                    { sales_brand: { contains: search } },
                    { account_name: { contains: search } },
                    { phone_number: { contains: search } },
                    { account_number: { contains: search } },
                    { nik: { contains: search } },
                    { bank_branch: { contains: search } },
                    {
                      sales_categories: {
                        some: {
                          categories: { category_name: { contains: search } },
                        },
                      },
                    },
                  ],
                },
              ]
            : []),
          ...(store_id
            ? [
                {
                  store_id: {
                    in: store_id,
                  },
                },
              ]
            : []),
          ...(is_active
            ? [
                {
                  is_active: Boolean(is_active),
                },
              ]
            : []),
          ...(date_from && date_to
            ? [
                {
                  created_at: {
                    gte: new Date(date_from),
                    lte: new Date(date_to),
                  },
                },
              ]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      const count = await this.dbService.sales.count({
        where,
      });

      const getTake = () => {
        if (take <= 0 && !store_id) {
          return 100;
        }
        return take;
      };

      const sales = await this.dbService.sales.findMany({
        where,
        skip,
        take: getTake(),
        include: {
          orders: {
            where: {
              deleted_at: null,
              ...(order_date_from && order_date_to
                ? {
                    created_at: {
                      gte: new Date(order_date_from),
                      lte: new Date(`${order_date_to}T23:59:59.000Z`),
                    },
                  }
                : undefined),
              ...(is_promotion === 1
                ? {
                    payment_type: {
                      not: 'survey',
                    },
                  }
                : is_promotion === 0
                ? {
                    payment_type: 'survey',
                  }
                : {}),
            },
          },
          bank: true,
          store: true,
          sales_brands: {
            include: {
              brands: true,
            },
          },
          sales_categories: {
            include: {
              categories: true,
            },
          },
          users: true,
        },
      });

      const dataSales = sales.map((item) => {
        const totalOrder = item.orders.length;

        return {
          ...item,
          sales_total_order: totalOrder,
        };
      });

      if (Boolean(top_best)) {
        dataSales.sort((a, b) => b.sales_total_order - a.sales_total_order);
      }
      return {
        data: dataSales,
        meta: {
          total: count,
          page,
          take: getTake(),
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const sales = await this.dbService.sales.findFirst({
        where: {
          id,
        },
        include: {
          bank: true,
          store: true,
          sales_brands: {
            include: {
              brands: true,
            },
          },
          sales_categories: {
            include: {
              categories: true,
            },
          },
          users: true,
        },
      });

      return sales;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(id: number, updateSalesDto: UpdateSalesDto, user: users) {
    try {
      const { id: user_id } = user;
      const sales = await this.dbService.sales.findFirst({
        where: {
          id,
        },
        include: {
          users: true,
          store: true,
        },
      });

      if (!sales) {
        throw new NotFoundException('Sales not found');
      }

      const SALES_ROLES: roles = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'sales',
          },
        },
      });

      const upsertSalesCategories: Prisma.sales_categoriesUpsertWithWhereUniqueWithoutSalesInput[] =
        updateSalesDto.sales_categories
          ? updateSalesDto.sales_categories.map(
              ({ id, category_id, commission }) => ({
                where: {
                  id: id ?? 0,
                },
                update: {
                  category_id,
                  commission,
                  updated_at: new Date(),
                  updated_by: user_id,
                },
                create: {
                  category_id,
                  commission,
                  created_at: new Date(),
                  created_by: user_id,
                },
              }),
            )
          : undefined;

      const salesUsername = updateSalesDto.full_name
        ? `${updateSalesDto.full_name
            .toLowerCase()
            .replace(/ /g, '_')}_${sales.store.store_name
            .toLowerCase()
            .replace(/ /g, '_')}`
        : sales?.users?.username;

      const salesPassword = updateSalesDto.password
        ? await hash(updateSalesDto.password, 12)
        : sales?.users?.password
        ? sales.users.password
        : await hash('password', 12);

      const salesData: Prisma.salesUpdateInput = {
        users: sales.users
          ? {
              update: {
                where: {
                  id: sales.user_id,
                },
                data: {
                  ...(updateSalesDto.username && {
                    username: updateSalesDto.username,
                  }),
                  ...(updateSalesDto.password && {
                    password: salesPassword,
                  }),
                  ...(updateSalesDto.is_active !== null && {
                    is_active: Boolean(updateSalesDto.is_active),
                  }),
                  updated_at: new Date(),
                  updated_by: user_id,
                },
              },
            }
          : updateSalesDto.username || updateSalesDto.password
          ? {
              create: {
                username: updateSalesDto.username
                  ? updateSalesDto.username
                  : salesUsername,
                password: salesPassword,
                created_by: user_id,
                created_at: new Date(),
                role_id: SALES_ROLES.id,
                is_active: Boolean(updateSalesDto.is_active),
              },
            }
          : undefined,

        ...(updateSalesDto.bank_id
          ? {
              bank: {
                connect: {
                  id: updateSalesDto.bank_id,
                },
              },
            }
          : undefined),
        ...(updateSalesDto.store_id
          ? {
              store: {
                connect: {
                  id: updateSalesDto.store_id,
                },
              },
            }
          : undefined),
        account_name: updateSalesDto.account_name,
        account_number: updateSalesDto.account_number,
        phone_number: updateSalesDto.phone_number,
        bank_branch: updateSalesDto.bank_branch,
        full_name: updateSalesDto.full_name,
        nik: updateSalesDto.nik,
        sales_brand: updateSalesDto.sales_brand,
        sales_categories: {
          upsert: upsertSalesCategories,
        },
        is_active: Boolean(updateSalesDto.is_active),
        updated_at: new Date(),
        updated_by: user_id,
      };

      const updatedSales = await this.dbService.$transaction([
        this.dbService.sales.update({
          where: {
            id,
          },
          data: salesData,
          include: {
            users: true,
          },
        }),
        ...(updateSalesDto.sales_categories
          ? [
              this.dbService.sales_categories.updateMany({
                where: {
                  sales_id: id,
                  id: {
                    notIn: updateSalesDto.sales_categories.map(
                      ({ category_id }) => category_id,
                    ),
                  },
                },
                data: {
                  deleted_at: new Date(),
                  deleted_by: user_id,
                },
              }),
            ]
          : []),
      ]);

      this.emailQueue.add(
        'send-credential-mail',
        {
          username: salesUsername,
          password: updateSalesDto?.password ?? 'password',
        },
        {
          attempts: 3,
        },
      );

      return updatedSales[0];
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async salesUser(store_id: number) {
    try {
      const sales = await this.dbService.sales.findMany({
        take: 10,
        where: {
          store_id,
          user_id: null,
          deleted_at: null,
        },
        include: {
          users: true,
          store: true,
        },
      });
      const roles = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'sales',
          },
        },
      });
      const userSales = [];
      await Promise.all(
        sales.map(async (sale) => {
          const { full_name, store_id, id, store } = sale;
          const storeSnakeCase = store.store_name
            .toLowerCase()
            .replace(/\s+/g, '_');
          const fullNameSnakeCase = full_name
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/\W/g, '');

          // lowerCase, snake_case, remove special characters
          const username = `${fullNameSnakeCase.replace(
            /_(\w)_/g,
            '_$1',
          )}_${storeSnakeCase.replace(/_(\w)_/g, '_$1')}`;
          const password = hashSync('password', 12);
          const role_id = roles.id;

          userSales.push({ username, password, role_id });

          const user = await this.dbService.users.create({
            data: {
              username,
              password,
              role_id,
            },
          });

          await this.dbService.sales.update({
            where: {
              id,
              store_id,
            },
            data: {
              user_id: user.id,
            },
          });

          return sale;
        }),
      );

      return userSales;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user: users) {
    try {
      const { id: user_id } = user;

      const sales = await this.dbService.sales.findUnique({
        where: {
          id,
        },
      });

      if (!sales) {
        throw new NotFoundException('Sales not found');
      }

      const [deletedSales, deletedUser] = await this.dbService.$transaction([
        this.dbService.sales.update({
          where: { id },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
            is_active: false,
          },
        }),

        this.dbService.users.update({
          where: { id: sales.user_id },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
            is_active: false,
          },
        }),
      ]);

      return deletedSales;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  // Delegations to SalesExportService
  async templateDefaultExcel(res: Response, query: QueryParamsDto) {
    return this.exportService.templateDefaultExcel(res, query);
  }

  async syncSalesCommission(filePath: string, user: users) {
    return this.exportService.syncSalesCommission(filePath, user);
  }

  async salesExportExcel(res: Response, queryParams: QueryParamsDto) {
    return this.exportService.salesExportExcel(res, queryParams);
  }

  // Delegations to SalesManagementService
  async deleteOrder() {
    return this.managementService.deleteOrder();
  }

  async salesUserManagement() {
    return this.managementService.salesUserManagement();
  }

  async managementSalesSixMonth() {
    return this.managementService.managementSalesSixMonth();
  }

  async apiManagementSales(range_date: 7 | 4) {
    return this.managementService.apiManagementSales(range_date);
  }

  async updateDateSalesIncentive(id: number) {
    return this.managementService.updateDateSalesIncentive(id);
  }

  async deleteSalesIncentive(id: number) {
    return this.managementService.deleteSalesIncentive(id);
  }
}
