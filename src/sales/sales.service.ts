import { Injectable, HttpStatus, HttpException } from '@nestjs/common';
import { CreateSalesDto } from './dto/create-sale.dto';
import { UpdateSalesDto } from './dto/update-sale.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { hash } from 'bcrypt';

@Injectable()
export class SalesService {
  constructor(private readonly dbService: PrismaService) {}

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
    const bank = await this.dbService.bank.findFirst({
      where: {
        id: createSalesDto.bank_id,
      },
    });

    if (bank.is_active == false)
      throw new HttpException('Bank is not active', HttpStatus.BAD_REQUEST);
    let users;
    if (createSalesDto.full_name && createSalesDto.nik) {
      users = await this.dbService.users.create({
        data: {
          username: createSalesDto.full_name,
          password: await hash(createSalesDto.nik, 20),
          roles: {
            connect: {
              id: 3, // FIXME: FILL WITH ROLES SALES
            },
          },
          created_by: user_id,
        },
      });
    }

    const sales_brands: Prisma.sales_brandsCreateManyInput[] =
      createSalesDto.sales_brands.map((item) => {
        return {
          brands_id: item.brands_id,
          created_by: user_id,
        };
      });

    const sales_categories: Prisma.sales_categoriesCreateManyInput[] =
      createSalesDto.sales_categories.map((item) => {
        return {
          category_id: item.category_id,
          created_by: user_id,
        };
      });

    const sales_data: Prisma.salesCreateInput = {
      full_name: createSalesDto.account_name,
      bank_branch: createSalesDto.bank_branch,
      account_name: createSalesDto.account_name,
      created_by: user_id,
      nik: createSalesDto.nik,
      users: {
        ...(users
          ? {
              connect: {
                id: users.id,
              },
            }
          : undefined),
      },
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
    };
    const [sales] = await this.dbService.$transaction([
      this.dbService.sales.create({
        data: sales_data,
      }),
    ]);

    return { sales, ...(users ? users : undefined)  };
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
    let users = undefined;
    if (updateSalesDto.full_name || updateSalesDto.nik) {
      const user = await this.dbService.users.findFirst({
        where: {
          sales: {
            every: {
              id: id,
            },
          },
        },
      });
      users = await this.dbService.users.update({
        where: {
          id: user.id,
        },
        data: {
          username: updateSalesDto.full_name
            ? updateSalesDto.full_name
            : undefined,
          password: updateSalesDto.nik
            ? await hash(updateSalesDto.nik, 20)
            : undefined,
        },
      });
    }
    console.log(typeof users);

    const updateSalesBrands = updateSalesDto.sales_brands
      ? updateSalesDto.sales_brands
          .filter((x) => Boolean(x.id))
          .map(({ id, brands_id: brand_id }) => {
            return {
              where: { id },
              data: {
                brand_id,
                updated_at: new Date(),
                updated_by: user_id,
              },
            };
          })
      : undefined;

    const newSalesBrands = updateSalesDto.sales_brands
      ? {
          data: updateSalesDto.sales_brands
            .filter((x) => !Boolean(x.id))
            .map(({ brands_id: brand_id }) => ({
              brand_id,
              created_by: user_id,
            })),
        }
      : undefined;

    const updateSalesCategories = updateSalesDto.sales_categories
      ? updateSalesDto.sales_categories
          .filter((x) => Boolean(x.id))
          .map(({ id, category_id }) => {
            return {
              where: { id },
              data: {
                category_id,
                updated_at: new Date(),
                updated_by: user_id,
              },
            };
          })
      : undefined;

    const newSalesCategories = updateSalesDto.sales_categories
      ? {
          data: updateSalesDto.sales_categories
            .filter((x) => !Boolean(x.id))
            .map(({ category_id }) => ({
              category_id,
              created_by: user_id,
            })),
        }
      : undefined;

    const salesData: Prisma.salesUpdateInput = {
      ...(users
        ? {
            users: {
              connect: {
                id: users.id,
              },
            },
          }
        : undefined),
      bank: {
        connect: {
          id: updateSalesDto.bank_id,
        },
      },
      account_name: updateSalesDto.account_name,
      bank_branch: updateSalesDto.bank_branch,
      full_name: updateSalesDto.full_name,
      nik: updateSalesDto.nik,
      ...(updateSalesBrands || newSalesBrands
        ? {
            sales_brands: {
              createMany: newSalesBrands ? newSalesBrands : undefined,
              update: updateSalesBrands ? updateSalesBrands : undefined,
            },
          }
        : undefined),
      ...(updateSalesCategories || newSalesCategories
        ? {
            sales_categories: {
              createMany: newSalesCategories ? newSalesCategories : undefined,
              update: updateSalesCategories ? updateSalesCategories : undefined,
            },
          }
        : undefined),
      updated_at: new Date(),
      updated_by: user_id,
    };

    const [syncSalesBrands, syncSalesCategories, sales] =
      await this.dbService.$transaction([
        this.dbService.sales_brands.deleteMany({
          where: {
            sales_id: id,
            NOT: updateSalesDto.sales_brands
              ? updateSalesDto.sales_brands.map((item) => ({
                  brands_id: item.brands_id,
                }))
              : undefined,
          },
        }),
        this.dbService.sales_categories.deleteMany({
          where: {
            sales_id: id,
            NOT: updateSalesDto.sales_categories
              ? updateSalesDto.sales_categories.map((item) => ({
                  category_id: item.category_id,
                }))
              : undefined,
          },
        }),
        this.dbService.sales.update({
          where: {
            id,
          },
          data: salesData,
        }),
      ]);
    return sales;
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
