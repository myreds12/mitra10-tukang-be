/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash, hashSync } from 'bcrypt';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma, users } from '@prisma/client';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Response } from 'express';
import { VendorExportService } from './vendor-export.service';
import { VendorQueryService } from './vendor-query.service';

@Injectable()
export class VendorService {
  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly exportService: VendorExportService,
    private readonly queryService: VendorQueryService,
  ) {}

  async create(
    files: VendorFiles,
    createVendorDto: CreateVendorDto,
    user: users,
  ) {
    try {
      const { id: user_id } = user;
      const vendorFiles: Array<Prisma.vendor_documentCreateManyInput> = files
        ? Object.entries(files).flatMap(([key, fileArray]) =>
          fileArray.map((file) => ({
            document_name: key,
            path: file.filename,
            created_by: user_id,
          }))
        )
        : [];


      const vendorAreaData: Prisma.vendor_areaCreateManyInput[] =
        createVendorDto.area_id
          ? createVendorDto.area_id.map((area_id) => ({
            area_id,
            default_discount: createVendorDto.discount,
            default_markup: createVendorDto.markup,
            created_by: user_id,
          }))
          : undefined;
      const vendorServiceData = createVendorDto.service_type_id?.map((service_type_id) => ({ service_type_id })) ?? [];


      //FIXME: CHECK THIS CODE
      const role = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'owner vendor',
          },
        },
      });

      const vendorStore: Prisma.vendor_storeCreateManyVendorInput[] =
        createVendorDto.vendor_store.map((item) => {
          return {
            store_id: item.store_id,
          };
        });

      const formattedUsername =
        createVendorDto?.default_username.replace(/ /g, '_') ??
        createVendorDto.pic_name.replace(/ /g, '_');

      const username = createVendorDto.default_username
        ? formattedUsername
        : `${createVendorDto.email_address}`;
      const users = await this.dbService.users.create({
        data: {
          username,
          password: await hash(createVendorDto.password, 10),
          role_id: role.id,
        },
      });

      const vendorData: Prisma.vendorCreateInput = {
        type: createVendorDto?.vendor_type,
        pkp_nominal: createVendorDto.pkp_nominal,
        margin_nominal: createVendorDto.margin_nominal,
        margin_type: createVendorDto.margin_type,
        max_order: createVendorDto.max_order,
        address: createVendorDto.address,
        pic_name: createVendorDto.pic_name,
        company_name: createVendorDto.company_name,
        email_address: createVendorDto.email_address,
        nominal_survey: createVendorDto.nominal_survey,
        account_name: createVendorDto.account_name,
        account_number: createVendorDto.account_number
          ? createVendorDto.account_number
          : undefined,
        phone_number: createVendorDto.phone_number,
        ktp_number: createVendorDto.ktp_number,
        npwp_number: createVendorDto.npwp_number,
        bank: createVendorDto.bank_id
          ? {
            connect: {
              id: createVendorDto.bank_id,
            },
          }
          : undefined,
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
        pic_vendor: {
          create: {
            user_id: users.id,
            pic_name: createVendorDto.pic_name,
          },
        },
      };

      const [vendor] = await this.dbService.$transaction([
        this.dbService.vendor.create({
          data: vendorData,
        }),
      ]);

      this.emailQueue.add(
        'send-credential-mail',
        {
          username: users.username,
          password: createVendorDto.password ?? 'password',
        },
        {
          attempts: 3,
        },
      );

      return { data: vendor, meta: { users } };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  async update(
    id: number,
    files: VendorFiles,
    updateVendorDto: UpdateVendorDto,
    user: users,
  ) {
    try {
      const { id: user_id } = user;
      const vendors = await this.dbService.vendor.findFirst({
        where: {
          id,
        },
        include: {
          pic_vendor: {
            where: {
              vendor_id: id,
              users: {
                roles: {
                  name: {
                    contains: 'Owner Vendor',
                  },
                },
              },
            },
            include: {
              users: true,
            },
          },
        },
      });

      const vendorFiles: Array<Prisma.vendor_documentCreateManyInput> = files
        ? Object.entries(files).flatMap(([key, fileArray]) =>
          fileArray.map((file) => ({
            document_name: key,
            path: file.filename,
            created_by: user_id,
          }))
        )
        : [];

      const vendorServiceUpsert: Prisma.vendor_serviceUpsertWithWhereUniqueWithoutVendorInput[] =
        updateVendorDto.vendor_service
          ? updateVendorDto.vendor_service.map((item) => ({
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
          }))
          : undefined;

      const vendorStoreUpsert: Prisma.vendor_storeUpsertWithWhereUniqueWithoutVendorInput[] =
        updateVendorDto.vendor_store
          ? updateVendorDto.vendor_store.map((item) => ({
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
          }))
          : undefined;

      const vendorAreaUpsert: Prisma.vendor_areaUpsertWithWhereUniqueWithoutVendorInput[] =
        updateVendorDto.vendor_area
          ? updateVendorDto.vendor_area.map((item) => ({
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
          }))
          : undefined;

      const formattedUsername =
        updateVendorDto?.default_username.replace(/ /g, '_') ?? undefined;

      // Check if pic_vendor exists to prevent undefined error
      const existingPicVendor = vendors.pic_vendor?.[0];

      const vendorData: Prisma.vendorUpdateInput = {
        type: updateVendorDto?.vendor_type,
        pkp_nominal: updateVendorDto?.pkp_nominal,
        margin_nominal: updateVendorDto.margin_nominal,
        margin_type: updateVendorDto.margin_type,
        address: updateVendorDto.address,
        max_order: updateVendorDto.max_order,
        pic_name: updateVendorDto.pic_name,
        company_name: updateVendorDto.company_name,
        account_name: updateVendorDto.account_name,
        nominal_survey: updateVendorDto.nominal_survey,
        account_number: updateVendorDto.account_number
          ? updateVendorDto.account_number
          : undefined,
        email_address: updateVendorDto.email_address,
        phone_number: updateVendorDto.phone_number,
        ktp_number: updateVendorDto.ktp_number,
        npwp_number: updateVendorDto.npwp_number,
        join_date: updateVendorDto.join_date
          ? new Date(updateVendorDto.join_date)
          : null,
        updated_by: user_id,
        bank: updateVendorDto.bank_id
          ? {
              connect: {
                id: updateVendorDto.bank_id,
              },
            }
          : undefined,
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
        // Only update pic_vendor if it exists (prevents error for legacy vendors)
        ...(existingPicVendor
          ? {
              pic_vendor: {
                update: {
                  where: {
                    id: existingPicVendor.id,
                  },
                  data: {
                    email_address: updateVendorDto?.email_address ?? undefined,
                    pic_name: updateVendorDto?.pic_name ?? undefined,
                    users: {
                      update: {
                        username: updateVendorDto.default_username
                          ? formattedUsername
                          : existingPicVendor.users?.username,
                        password: updateVendorDto.password
                          ? await hashSync(updateVendorDto.password, 12)
                          : undefined,
                      },
                    },
                  },
                },
              },
            }
          : {}),
      };

      const [syncVendorStore, syncArea, syncService, syncDocument, vendor] =
        await this.dbService.$transaction([
          this.dbService.vendor_store.updateMany({
            where: {
              vendor_id: id,
              ...(updateVendorDto.vendor_store
                ? {
                  NOT: updateVendorDto.vendor_store.map((item) => {
                    return {
                      id: item?.id,
                      store_id: item.store_id,
                    };
                  }),
                }
                : undefined),
            },
            data: {
              deleted_by: user_id,
              deleted_at: new Date(),
            },
          }),
          this.dbService.vendor_area.updateMany({
            where: {
              vendor_id: id,
              // NOT: updateVendorDto.vendor_area
              //   ? updateVendorDto.vendor_area.map((item) => {
              //     return {
              //       area_id: item.area_id,
              //       id: item.id,
              //     };
              //   })
              //   : undefined,
              ...(updateVendorDto.vendor_area
                ? {
                  NOT: updateVendorDto.vendor_area.map((item) => {
                    return {
                      id: item?.id,
                      area_id: item.area_id,
                    };
                  }),
                }
                : undefined),
            },
            data: {
              deleted_by: user_id,
              deleted_at: new Date(),
            },
          }),
          this.dbService.vendor_service.updateMany({
            where: {
              vendor_id: id,
              // NOT: updateVendorDto.vendor_service
              //   ? updateVendorDto.vendor_service.map((item) => {
              //     return {
              //       service_type_id: item?.service_type_id,
              //       id: item?.id,
              //     };
              //   })
              //   : undefined,
              ...(updateVendorDto.vendor_service
                ? {
                  NOT: updateVendorDto.vendor_service.map((item) => {
                    return {
                      id: item?.id,
                      service_type_id: item?.service_type_id,
                    };
                  }),
                }
                : undefined),
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
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  async remove(id: number, user: users) {
    try {
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
        },
      });

      return vendor;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }



  // Delegations to VendorQueryService
  async findAll(query: QueryParamsDto) {
    return this.queryService.findAll(query);
  }

  async findOne(id: number) {
    return this.queryService.findOne(id);
  }

  async nextCode() {
    return this.queryService.nextCode();
  }

  // Delegations to VendorExportService
  async vendorExportExcel(res: Response, queryParams: QueryParamsDto) {
    return this.exportService.vendorExportExcel(res, queryParams);
  }
}
