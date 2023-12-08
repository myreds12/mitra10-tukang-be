import { Injectable, HttpStatus, HttpException } from '@nestjs/common';
import { CreateSalesDto } from './dto/create-sale.dto';
import { UpdateSalesDto } from './dto/update-sale.dto';
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
  ) { }

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
    console.log(createSalesDto);

    const { id: user_id } = user;
    const bank = await this.dbService.bank.findFirst({
      where: {
        id: createSalesDto.bank_id,
      },
    });

    if (bank.is_active == false)
      throw new HttpException('Bank is not available', HttpStatus.BAD_REQUEST);

    const SALES_ROLES = await this.dbService.roles.findFirst({
      where: {
        name: {
          contains: 'sales',
        },
      },
    });

    const sales_brands: Prisma.sales_brandsCreateManyInput[] =
      createSalesDto.sales_brands.map((item) => {
        return {
          brands_id: item.brand_id,
          created_by: user_id,
        };
      });

    const sales_categories: Prisma.sales_categoriesCreateManyInput[] =
      createSalesDto.sales_categories.map((item) => {
        return {
          category_id: item.category_id,
          commission: item.commission,
          created_by: user_id,
        };
      });

    const saltedPassword = hashSync(createSalesDto?.nik ?? 'password', 12);

    const sales_data: Prisma.salesCreateInput = {
      full_name: createSalesDto.full_name,
      bank_branch: createSalesDto.bank_branch,
      account_name: createSalesDto.account_name,
      phone_number: createSalesDto.phone_number,
      account_number: createSalesDto.account_number,
      created_by: user_id,
      nik: createSalesDto.nik,
      store: {
        connect: {
          id: createSalesDto.store_id ? createSalesDto.store_id : undefined,
        },
      },
      bank: {
        connect: {
          id: createSalesDto.bank_id,
        },
      },
      sales_brands: {
        createMany: {
          data: sales_brands,
        },
      },
      sales_categories: {
        createMany: {
          data: sales_categories,
        },
      },
      users: {
        connectOrCreate: {
          where: {
            username: createSalesDto.full_name.toLowerCase().replace(' ', '_'),
            id: 0,
          },
          create: {
            username: createSalesDto.full_name.toLowerCase().replace(' ', '_'),
            password: saltedPassword,
            role_id: SALES_ROLES.id,
          },
        },
      },
    };

    const [sales] = await this.dbService.$transaction([
      // this.dbService.users.create({ data: userQuery }),
      this.dbService.sales.create({
        data: { ...sales_data },
        include: {
          users: true
        }
      }),
    ]);

    return { sales };
  }

  async findAll(query: QueryParamsDto) {
    const { search, take, page, date_from, date_to } = query;
    const skip = page * take - take;

    const where: Prisma.salesWhereInput = {
      AND: [
        ...(search
          ? [
            {
              OR: [
                { full_name: { contains: search } },
                {
                  sales_brands: {
                    every: { brands: { name: { contains: search } } },
                  },
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
      ].filter(Boolean),
      deleted_at: null,
    };
    const sales = await this.dbService.sales.findMany({
      where,
      skip,
      take: take <= 0 ? undefined : take,
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

    return {
      data: sales,
      total: sales.length,
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
    });

    const SALES_ROLES: roles = await this.dbService.roles.findFirst({
      where: {
        name: {
          contains: 'sales',
        },
      },
    });

    const usersConnectOrCreate: Prisma.usersCreateNestedOneWithoutSalesInput = {
      connectOrCreate: {
        where: {
          id: sales?.user_id ?? 0,
        },
        create: {
          username: updateSalesDto.full_name
            ? updateSalesDto.full_name
            : undefined,
          password: updateSalesDto.nik
            ? await hash(updateSalesDto.nik, 20)
            : undefined,
          role_id: SALES_ROLES.id,
        },
      },
    };

    const upsertSalesBrands: Prisma.sales_brandsUpsertWithWhereUniqueWithoutSalesInput[] =
      updateSalesDto.sales_brands.map((i) => ({
        where: {
          id: i?.id ?? 0,
          brands_id: i.brand_id,
        },
        update: {
          brands_id: i.brand_id,
          updated_at: new Date(),
          updated_by: user_id,
        },
        create: {
          brands_id: i.brand_id,
          created_by: user_id,
        },
      }));
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
      users: {
        ...usersConnectOrCreate,
      },
      bank: {
        connect: {
          id: updateSalesDto.bank_id,
        },
      },
      account_name: updateSalesDto.account_name,
      bank_branch: updateSalesDto.bank_branch,
      full_name: updateSalesDto.full_name,
      nik: updateSalesDto.nik,
      sales_brands: {
        upsert: upsertSalesBrands,
      },
      sales_categories: {
        upsert: upsertSalesCategories,
      },
      updated_at: new Date(),
      updated_by: user_id,
    };

    const [syncSalesBrands, syncSalesCategories, updatedSales] =
      await this.dbService.$transaction([
        this.dbService.sales_brands.updateMany({
          where: {
            sales_id: id,
            id: {
              notIn: updateSalesDto.sales_brands.map(
                ({ brand_id }) => brand_id,
              ),
            },
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id
          }
        }),
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
            deleted_by: user_id
          }
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
