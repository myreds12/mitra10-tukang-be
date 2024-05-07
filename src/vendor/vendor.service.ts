import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash } from 'bcrypt';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { Prisma, users } from '@prisma/client';
import { UpdateOrderDto } from 'src/order/dto/update-order.dto';
import { SendEmailService } from 'src/mails/send-email.service';
@Injectable()
export class VendorService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly sendMailService: SendEmailService,
  ) {}
  async create(
    files: VendorFiles,
    createVendorDto: CreateVendorDto,
    user: users,
  ) {
    const { id: user_id } = user;

    const vendorFiles: Array<Prisma.vendor_documentCreateManyInput> = files
      ? Object.entries(files).map((file) => {
          if (file[1].length) {
            const newFile = file[1].map((item) => ({
              document_name: file[0],
              path: item.filename,
              created_by: user_id,
            }));

            return newFile;
          }
        })
      : undefined;

    const vendorAreaData: Prisma.vendor_areaCreateManyInput[] =
      createVendorDto.area_id
        ? createVendorDto.area_id.map((area_id) => ({
            area_id,
            default_discount: createVendorDto.discount,
            default_markup: createVendorDto.markup,
            created_by: user_id,
          }))
        : undefined;

    const vendorBankData: Prisma.vendor_bankCreateInput = {
      account_name: createVendorDto.account_name,
      account_number: createVendorDto.account_number,
      bank: {
        connect: {
          id: createVendorDto.bank_id,
        },
      },
      created_by: user_id,
    };

    const vendorServiceData: Prisma.vendor_serviceCreateManyInput[] =
      createVendorDto.service_type_id
        ? createVendorDto.service_type_id.map((item) => {
            return {
              service_type_id: item,
            };
          })
        : undefined;

    const role = await this.dbService.roles.findFirst({
      where: {
        name: {
          contains: 'admin vendor',
        },
      },
    });

    const vendorStore: Prisma.vendor_storeCreateManyVendorInput[] =
      createVendorDto.vendor_store.map((item) => {
        return {
          store_id: item.store_id,
        };
      });

    const username = createVendorDto.default_username
      ? createVendorDto.default_username
      : `${createVendorDto.email_address}`;
    const users = await this.dbService.users.create({
      data: {
        username,
        password: await hash(createVendorDto.password, 10),
        role_id: role.id,
      },
    });

    const vendorData: Prisma.vendorCreateInput = {
      users: {
        connect: {
          id: users.id,
        },
      },
      max_order: createVendorDto.max_order,
      address: createVendorDto.address,
      pic_name: createVendorDto.pic_name,
      company_name: createVendorDto.company_name,
      email_address: createVendorDto.email_address,
      phone_number: createVendorDto.phone_number,
      ktp_number: createVendorDto.ktp_number,
      npwp_number: createVendorDto.npwp_number,
      join_date: createVendorDto.join_date
        ? new Date(createVendorDto.join_date)
        : null,
      created_by: user_id,
      ...(vendorFiles
        ? {
            vendor_document: {
              createMany: {
                data: vendorFiles.flat(),
              },
            },
          }
        : undefined),
      ...(vendorAreaData
        ? {
            vendor_area: {
              createMany: {
                data: vendorAreaData,
              },
            },
          }
        : undefined),
      ...(vendorServiceData
        ? {
            vendor_service: {
              createMany: {
                data: vendorServiceData,
              },
            },
          }
        : undefined),
      vendor_store: {
        createMany: {
          data: vendorStore,
        },
      },
      vendor_bank: {
        create: vendorBankData,
      },
    };

    const [vendor] = await this.dbService.$transaction([
      this.dbService.vendor.create({
        data: vendorData,
      }),
    ]);
    await this.sendMailService.sendCredentialMail(
      users.username,
      createVendorDto.password,
    );

    return { vendor, users };
  }

  /**
   * Retrieves a list of vendors based on the provided query parameters.
   * @param query - The query parameters for filtering and pagination.
   * @returns An object containing the list of vendors, total count, and pagination details.
   */
  async findAll(query: QueryParamsDto) {
    const {
      take,
      page,
      search,
      date_from,
      date_to,
      store_id,
      vendor_with_max_order,
    } = query;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const formattedDate = now.toISOString();

    console.log('vendor_with_max_order', vendor_with_max_order);
    const skip = page * take - take;

    const where: Prisma.vendorWhereInput = {
      AND: [
        ...(search
          ? [
              {
                OR: [
                  { phone_number: { contains: search } },
                  { email_address: { contains: search } },
                  { company_name: { contains: search } },
                ],
              },
            ]
          : []),
        ...(store_id
          ? [
              {
                vendor_store: { some: { store_id: { in: store_id } } },
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

    let vendor = await this.dbService.vendor.findMany({
      where,
      skip,
      take: take <= 0 ? undefined : take,
      include: {
        orders: true,
        tukang: true,
        users: true,
        vendor_area: {
          include: {
            area: true,
          },
        },
        vendor_bank: {
          include: {
            bank: true,
          },
        },
        vendor_document: true,
        vendor_service: {
          include: {
            service_type: true,
          },
        },
        vendor_store: {
          select: {
            store: {
              select: {
                id: true,
                store_name: true,
                additional_address: true,
                address: true,
                bank_account: true,
                bank_name: true,
                bank_number: true,
                email: true,
                phone_number_1: true,
                phone_number_2: true,
                area_id: true,
                area: true,
              },
            },
          },
        },
        work_orders: {
          where: {
            // survey_date: new Date(),
            OR: [
              {
                survey_date: formattedDate,
              },
              {
                work_start_date: {
                  gte: formattedDate,
                },
                work_end_date: {
                  lte: formattedDate,
                },
              },
            ],
          },
        },
      },
    });
    console.log(new Date(), new Date('2024-05-03'), new Date().toISOString());
    if (vendor_with_max_order) {
      vendor = vendor.filter(({ id, work_orders, max_order, company_name }) => {
        console.log(`[${id}] ${company_name} - ${work_orders.length}`);
        console.log(work_orders);
        return max_order > work_orders.length;
      });
    }

    const total = await this.dbService.vendor.count();

    return { data: vendor, total, takeTotal: vendor.length, page, take };
  }

  async findOne(id: number) {
    const vendor = await this.dbService.vendor.findFirst({
      where: {
        id,
        deleted_at: null,
      },
      include: {
        orders: true,
        tukang: true,
        users: true,
        vendor_area: {
          include: {
            area: true,
          },
        },
        vendor_bank: {
          include: {
            bank: true,
          },
        },
        vendor_document: true,
        vendor_service: {
          include: {
            service_type: true,
          },
        },
        work_orders: true,
        vendor_store: {
          select: {
            store: {
              select: {
                id: true,
                store_name: true,
                additional_address: true,
                address: true,
                bank_account: true,
                bank_name: true,
                bank_number: true,
                email: true,
                phone_number_1: true,
                phone_number_2: true,
                area_id: true,
                area: true,
              },
            },
          },
        },
      },
    });

    return vendor;
  }

  async update(
    id: number,
    files: VendorFiles,
    updateVendorDto: UpdateVendorDto,
    user: users,
  ) {
    const { id: user_id } = user;
    console.log(updateVendorDto);

    const vendorFiles: Prisma.vendor_documentCreateManyInput[] = files
      ? Object.entries(files).map((file) => {
          if (file[1].length) {
            const updateFile = file[1].map((item) => ({
              document_name: file[0],
              path: item.filename,
              created_by: user_id,
            }));
            return updateFile;
          }
        })
      : undefined;
    console.log(updateVendorDto.vendor_service);

    const vendorServiceUpsert: Prisma.vendor_serviceUpsertWithWhereUniqueWithoutVendorInput[] =
      updateVendorDto.vendor_service ? updateVendorDto.vendor_service.map((item) => ({
        where: {
          id: item.id ?? 0,
          vendor_id: id,
        },
        update: {
          service_type_id: item?.service_type_id,
          updated_by: user_id,
          updated_at: new Date(),
        },
        create: {
          service_type_id: item.service_type_id,
          created_by: user_id,
          created_at: new Date(),
        },
      })) : undefined;

    const vendorStoreUpsert: Prisma.vendor_storeUpsertWithWhereUniqueWithoutVendorInput[] =
      updateVendorDto.vendor_store ? updateVendorDto.vendor_store.map((item) => ({
        where: {
          id: item.id ?? 0,
        },
        create: {
          store_id: item.store_id,
          created_by: user_id,
        },
        update: {
          store_id: item.store_id,
          updated_by: user_id,
          updated_at: new Date(),
        },
      })) : undefined;

    const vendorAreaUpsert: Prisma.vendor_areaUpsertWithWhereUniqueWithoutVendorInput[] =
      updateVendorDto.vendor_area ? updateVendorDto.vendor_area.map((item) => ({
        where: {
          id: item.id ?? 0,
          vendor_id: id,
        },
        create: {
          area_id: item.area_id,
          default_discount: item.default_discount,
          default_markup: item.default_markup,
          default_unit: item.default_unit,
          created_by: user_id,
        },
        update: {
          area_id: item.area_id,
          default_discount: item.default_discount,
          default_markup: item.default_markup,
          default_unit: item.default_unit,
          updated_by: user_id,
          updated_at: new Date(),
        },
      })) : undefined;

    console.log(updateVendorDto);

    const vendorData: Prisma.vendorUpdateInput = {
      address: updateVendorDto.address,
      max_order: updateVendorDto.max_order,
      pic_name: updateVendorDto.pic_name,
      company_name: updateVendorDto.company_name,
      email_address: updateVendorDto.email_address,
      phone_number: updateVendorDto.phone_number,
      ktp_number: updateVendorDto.ktp_number,
      npwp_number: updateVendorDto.npwp_number,
      join_date: updateVendorDto.join_date
        ? new Date(updateVendorDto.join_date)
        : null,
      updated_by: user_id,
      vendor_bank: {
        update: {
          where: {
            id: updateVendorDto.vendor_bank.id,
          },
          data: {
            bank_id: updateVendorDto.vendor_bank.bank_id,
            account_name: updateVendorDto?.vendor_bank.account_name,
            account_number: updateVendorDto?.vendor_bank.account_number,
          },
        },
      },
      vendor_service: {
        upsert: vendorServiceUpsert,
      },
      vendor_area: {
        upsert: vendorAreaUpsert,
      },
      ...(vendorFiles
        ? {
            vendor_document: {
              createMany: {
                data: vendorFiles.flat(),
              },
            },
          }
        : undefined),
      vendor_store: {
        upsert: vendorStoreUpsert,
      },
    };

    const [syncVendorStore, syncArea, syncService, syncDocument, vendor] =
      await this.dbService.$transaction([
        this.dbService.vendor_store.updateMany({
          where: {
            vendor_id: id,
            NOT: updateVendorDto.vendor_store
              ? updateVendorDto.vendor_store.map((item) => {
                  return {
                    store_id: item.store_id,
                  };
                })
              : undefined,
          },
          data: {
            deleted_by: user_id,
            deleted_at: new Date(),
          },
        }),
        this.dbService.vendor_area.updateMany({
          where: {
            vendor_id: id,
            NOT: updateVendorDto.vendor_area
              ? updateVendorDto.vendor_area.map((item) => {
                  return {
                    area_id: item.area_id,
                  };
                })
              : undefined,
          },
          data: {
            deleted_by: user_id,
            deleted_at: new Date(),
          },
        }),
        this.dbService.vendor_service.updateMany({
          where: {
            vendor_id: id,
            NOT: updateVendorDto.vendor_service
              ? updateVendorDto.vendor_service.map((item) => {
                  return {
                    service_type_id: item?.service_type_id,
                    id: item?.id,
                  };
                })
              : undefined,
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
          },
        }),
        this.dbService.vendor_document.updateMany({
          where: {
            vendor_id: id,
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id,
          },
        }),
        this.dbService.vendor.update({
          where: {
            id,
          },
          data: vendorData,
        }),
      ]);
    return vendor;
  }

  async remove(id: number, user: users) {
    const { id: user_id } = user;
    const vendor = await this.dbService.vendor.update({
      where: {
        id,
      },
      data: {
        deleted_at: new Date(),
        is_active: false,
        deleted_by: user_id,
        vendor_area: {
          updateMany: {
            where: {
              vendor_id: id,
            },
            data: {
              deleted_by: user_id,
              deleted_at: new Date(),
              is_active: false,
            },
          },
        },
        vendor_document: {
          updateMany: {
            where: {
              vendor_id: id,
            },
            data: {
              deleted_by: user_id,
              deleted_at: new Date(),
              is_active: false,
            },
          },
        },
        vendor_service: {
          updateMany: {
            where: {
              vendor_id: id,
            },
            data: {
              deleted_by: user_id,
              deleted_at: new Date(),
              is_active: false,
            },
          },
        },
        vendor_bank: {
          updateMany: {
            where: {
              vendor_id: id,
            },
            data: {
              deleted_by: user_id,
              deleted_at: new Date(),
              is_active: false,
            },
          },
        },
      },
    });
    return vendor;
  }

  async nextCode() {
    const vendor = await this.dbService.vendor.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return vendor[0] || null;
  }
}
