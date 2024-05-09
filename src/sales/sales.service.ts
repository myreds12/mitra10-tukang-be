import { Injectable, HttpStatus, HttpException } from '@nestjs/common';
import { CreateSalesDto } from './dto/create-sales.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, roles, users } from '@prisma/client';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { hash, hashSync } from 'bcrypt';
import { AuthService } from 'src/auth/auth.service';

@Injectable()
export class SalesService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async getCode() {
    const sales = await this.dbService.sales.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return sales[0] || null;
  }

  async create(createSalesDto: CreateSalesDto, user: users) {
    const { id: user_id } = user;
    let bank;
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

    const saltedPassword = hashSync(createSalesDto?.password ?? 'password', 12);

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
            username: createSalesDto.full_name.toLowerCase().replace(/ /g, '_'),
            id: 0,
          },
          create: {
            username: createSalesDto.full_name.toLowerCase().replace(/ /g, '_'),
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

    return { sales };
  }

  async findAll(query: QueryParamsDto) {
    const {
      search,
      take,
      page,
      date_from,
      date_to,
      order_by,
      top_best,
      store_id,
    } = query;
    console.log(query);

    const skip = page * take - take;

    const where: Prisma.salesWhereInput = {
      AND: [
        ...(search
          ? [
              {
                OR: [
                  { full_name: { contains: search } },
                  // {
                  //   sales_brands: {
                  //     every: { brands: { name: { contains: search } } },
                  //   },
                  // },
                  {
                    sales_brand: { contains: search },
                  },
                  {
                    sales_categories: {
                      every: {
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
    const sales = await this.dbService.sales.findMany({
      where,
      skip,
      take: take <= 0 ? undefined : take,
      orderBy: {
        ...(top_best === true
          ? {
              order_total: 'desc',
            }
          : {
              created_at: order_by,
            }),
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
    const count = await this.dbService.sales.count({
      where,
    });

    return {
      data: sales,
      total: count,
      page,
      take,
    };
  }

  async findOne(id: number) {
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
  }

  async update(id: number, updateSalesDto: UpdateSalesDto, user: users) {
    const { id: user_id } = user;
    const sales = await this.dbService.sales.findFirst({
      where: {
        id,
      },
      include: {
        users: true,
      },
    });

    if (!sales) {
      throw new HttpException('Sales not found', HttpStatus.NOT_FOUND);
    }

    const SALES_ROLES: roles = await this.dbService.roles.findFirst({
      where: {
        name: {
          contains: 'sales',
        },
      },
    });

    let usersConnectOrCreate:
      | Prisma.usersCreateNestedOneWithoutSalesInput
      | undefined;

    if (updateSalesDto?.password) {
      usersConnectOrCreate = {
        connectOrCreate: {
          where: {
            id: sales?.user_id ?? 0,
          },
          create: {
            username: updateSalesDto?.username
              ? updateSalesDto.username
              : undefined,
            password: await hash(updateSalesDto?.password, 12),
            role_id: SALES_ROLES.id,
          },
        },
      };
    }

    const upsertSalesCategories: Prisma.sales_categoriesUpsertWithWhereUniqueWithoutSalesInput[] =
      updateSalesDto.sales_categories.map(
        ({ id, category_id, commission }) => ({
          where: {
            id: id ?? 0,
            category_id,
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
      );

    const salesData: Prisma.salesUpdateInput = {
      ...(usersConnectOrCreate ? { users: usersConnectOrCreate } : {}),
      bank: {
        connect: {
          id: updateSalesDto.bank_id,
        },
      },
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
      updated_at: new Date(),
      updated_by: user_id,
    };

    const [syncSalesCategories, updatedSales] =
      await this.dbService.$transaction([
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
        this.dbService.sales.update({
          where: {
            id,
          },
          data: salesData,
        }),
      ]);
    return updatedSales;
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
      const updatedSales = await Promise.all(
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
    const sales = await this.dbService.sales.update({
      where: {
        id,
      },
      data: {
        deleted_at: new Date(),
        deleted_by: user.id,
        is_active: false,
      },
    });

    return sales;
  }
}
