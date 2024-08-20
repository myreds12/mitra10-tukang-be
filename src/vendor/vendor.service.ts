import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash, hashSync } from 'bcrypt';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma, users } from '@prisma/client';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
@Injectable()
export class VendorService {
  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}
  async create(
    files: VendorFiles,
    createVendorDto: CreateVendorDto,
    user: users,
  ) {
    try {
      console.log(createVendorDto);
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
      const vendorServiceData: Prisma.vendor_serviceCreateManyInput[] =
        createVendorDto.service_type_id
          ? createVendorDto.service_type_id.map((item) => {
              return {
                service_type_id: item,
              };
            })
          : undefined;

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
        createVendorDto?.default_username.replace(/ /g, '_') ?? createVendorDto.pic_name.replace(/ /g, '_');

      if (formattedUsername.length > 20) {
        throw new BadRequestException(
          'Username tidak boleh lebih dari 20 karakter.',
        );
      }

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

      await this.emailQueue.add(
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

  /**
   * Retrieves a list of vendors based on the provided query parameters.
   * @param query - The query parameters for filtering and pagination.
   * @returns An object containing the list of vendors, total count, and pagination details.
   */
  async findAll(query: QueryParamsDto) {
    try {
      const {
        take,
        page,
        search,
        date_from,
        date_to,
        store_id,
        vendor_with_max_order,
        top_best,
        order_date_from,
        order_date_to,
      } = query;
      // ...(Boolean(top_best)
      //       ? {
      //           order_total: 'desc',
      //         }
      //       : {
      //           created_at: order_by,
      //         }),
      // now.setHours(0, 0, 0, 0);
      const formattedDate = new Date().toISOString().split('T')[0];
      console.log(formattedDate);
      

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
          orders: {
            where: {
              AND: [
                {
                  deleted_at: null,
                },
                ...(order_date_from && order_date_to
                  ? [
                      {
                        created_at: {
                          gte: new Date(order_date_from),
                          lte: new Date(`${order_date_to}T23:59:59.000Z`),
                        },
                      },
                    ]
                  : []),
              ],
            },
            orderBy:{
              created_at: 'desc'
            }
          },
          tukang: {
            include: {
              work_order_tukang: {
                where: {
                  deleted_at: null,
                },
                orderBy: {
                  created_at: 'desc'
                },
                include: {
                  work_orders: {
                    include: {
                      status: true,
                      work_order_status: true,
                    },
                  },
                },
              },
            },
          },
          pic_vendor: {
            include: {
              users: {
                select: {
                  id: true,
                  username: true,
                  roles: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          vendor_area: {
            include: {
              area: true,
            },
          },
          bank: true,
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
              deleted_at: null,
              OR: [
                {
                  survey_date: {
                    gte: new Date(`${formattedDate}T00:00:00.000Z`),
                    lte: new Date(`${formattedDate}T23:59:59.000Z`),
                  },
                },
                {
                  work_start_date: {
                    gte: new Date(`${formattedDate}T00:00:00.000Z`),
                  },
                  work_end_date: {
                    lte: new Date(`${formattedDate}T23:59:59.000Z`),
                  },
                }
              ],
            },
          },
        },
      });
      if (Boolean(top_best)) {
        vendor = vendor.sort((a, b) => b.orders.length - a.orders.length);
      }
      if (take > 0) {
        vendor = vendor.slice(0, take);
      }
  
      if (vendor_with_max_order) {
        vendor = vendor.filter((v) => {
          return v.tukang.some((t) => {
            const dailySlots = t.work_order_tukang.filter((item) => {
              const { work_start_date, work_end_date, survey_date, status, created_at } = item?.work_orders || {};
      
              let startDate: Date;
              let endDate: Date;
      
              if (work_start_date && work_end_date) {
                startDate = new Date(work_start_date);
                endDate = new Date(work_end_date);
              } else if (survey_date) {
                startDate = new Date(survey_date);
                endDate = startDate;
              } else {
                startDate = new Date(created_at);
                endDate = startDate;
              }
      
              const currentDate = new Date().toISOString().split('T')[0];
      
              const isWithinRange = startDate.toISOString().split('T')[0] <= currentDate &&
                                    endDate.toISOString().split('T')[0] >= currentDate;
              return (
                status?.category !== 'SURVEYDONE' &&
                status?.category !== 'WORKEND' &&
                isWithinRange
              );
            });
      
            return dailySlots.length <= v.max_order;
          });
        });
      }
      
      
  
      vendor = vendor.map((vendor) => {
        return {
          ...vendor,
          tukang: vendor.tukang.map((tukangItem) => {
            const dailySlots = tukangItem.work_order_tukang.filter((item) => {
              const orderDate = new Date(item.work_orders?.created_at ?? 0)
                .toISOString()
                .split('T')[0];
  
              return (
                item.work_orders?.status?.category !== 'SURVEYDONE' &&
                item.work_orders?.status?.category !== 'WORKEND' &&
                orderDate === formattedDate
              );
            });
  
            return {
              ...tukangItem,
              slot_order: dailySlots.length,
            };
          }),
        };
      });
      const dataVendor = vendor.map((item) => {
        console.log("ORDER MEMBER:" ,item.orders);
        
        const totalOrder = item.orders.length;

        
        return {
          ...item,
          total_order: totalOrder,
        };
      });
  
      const total = await this.dbService.vendor.count({ where });

      return {
        data: dataVendor,
        meta: { total, takeTotal: vendor.length, page, take },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const vendor = await this.dbService.vendor.findFirst({
        where: {
          id,
          deleted_at: null,
        },
        include: {
          orders: {
            where: {
              deleted_at: null,
            },
            orderBy: {
              created_at: 'desc',
            },
          },
          pic_vendor: {
            include: {
              users: true,
            },
          },
          tukang: {
            include: {
              tukang_area: {
                include: {
                  area: true,
                },
              },
              work_order_tukang: {
                where: {
                  deleted_at: null,
                },
                include: {
                  work_orders: {
                    include: {
                      status: true,
                      work_order_status: {
                        include: {
                          status: true,
                        },
                        orderBy: {
                          created_at: 'desc',
                        },
                      },
                      order: true,
                    },
                  },
                },
              },
            },
          },
          vendor_area: {
            include: {
              area: true,
            },
          },
          vendor_document: true,
          vendor_service: {
            include: {
              service_type: true,
            },
          },
          bank: true,
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

      if (vendor && vendor.tukang) {
        const now = new Date().toISOString().split('T')[0];

        vendor.tukang = vendor.tukang.map((tukangItem) => {
          const dailySlots = tukangItem.work_order_tukang.filter((item) => {
            const orderDate = new Date(
              item.work_orders.work_order_status[0].created_at,
            )
              .toISOString()
              .split('T')[0];
            return (
              item.work_orders.status.category !== 'SURVEYDONE' &&
              item.work_orders.status.category !== 'WORKEND' &&
              orderDate === now
            );
          });

          return {
            ...tukangItem,
            slot_order: dailySlots.length,
          };
        });
      }

      return vendor;
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
      console.log(updateVendorDto);
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

      console.log(updateVendorDto);

      const formattedUsername =
        updateVendorDto?.default_username.replace(/ /g, '_') ?? undefined;

      if (formattedUsername.length > 20) {
        throw new BadRequestException(
          'Username tidak boleh lebih dari 20 karakter.',
        );
      }

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
        pic_vendor: {
          update: {
            where: {
              id: vendors.pic_vendor[0].id,
            },
            data: {
              email_address: updateVendorDto?.email_address ?? undefined,
              pic_name: updateVendorDto?.pic_name ?? undefined,
              users: {
                update: {
                  username: updateVendorDto.default_username
                    ? formattedUsername
                    : vendors.pic_vendor[0].users.username,
                  password: updateVendorDto.password
                    ? await hashSync(updateVendorDto.password, 12)
                    : undefined,
                },
              },
            },
          },
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

  async nextCode() {
    try {
      const vendor = await this.dbService.vendor.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return vendor[0] || null;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async vendorExportExcel(res: Response, queryParams: QueryParamsDto) {
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
        { header: 'Vendor Id', key: 'id', width: 10 },
        { header: 'Nama PIC', key: 'pic_name', width: 25 },
        { header: 'Nama Perusahaan', key: 'company_name', width: 20 },
        { header: 'Email', key: 'email_address', width: 25 },
        { header: 'Phone Number', key: 'phone_number', width: 30 },
        { header: 'Service Type', key: 'vendor_service', width: 50 },
        { header: 'Serving Store', key: 'vendor_store', width: 50 },
        { header: 'Serving Area', key: 'vendor_area', width: 50 },
        { header: 'Username', key: 'username', width: 50 },
        { header: 'Tanggal Join', key: 'join_date', width: 30 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4CAF50' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      data.forEach((vendor) => {
        const dateTime = new Date(vendor.join_date ?? vendor.created_at);
        const formattedDateTime = `${dateTime.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}, ${dateTime.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
        const serviceType = vendor.vendor_service
          ? vendor.vendor_service
              .map((service) => service.service_type.service_type)
              .join(',')
          : '';
        const servingStore = vendor.vendor_store
          ? vendor.vendor_store
              .map((service) => service.store.store_name)
              .join(',')
          : '';
        const servingArea = vendor.vendor_area
          ? vendor.vendor_area.map((service) => service.area.area).join(',')
          : '';
        const row = worksheet.addRow({
          id: vendor.id,
          pic_name: vendor.pic_name ? vendor.pic_name : '',
          company_name: vendor.company_name ? vendor.company_name : '',
          email_address: vendor.email_address ? vendor.email_address : '',
          phone_number: vendor.phone_number ? vendor.phone_number : '',
          vendor_service: serviceType,
          vendor_store: servingStore,
          vendor_area: servingArea,
          username: vendor.pic_vendor
            ? vendor.pic_vendor
                .map(
                  (item) =>
                    `${item.users.username || 'N/a'}(${
                      item.users.roles.name || 'Tidak Ada Role'
                    })`,
                )
                .join(', ')
            : '',
          join_date: formattedDateTime,
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

      const grandTotal: number = data
        .map((vendor) =>
          vendor.orders.reduce((acc, order) => {
            return acc + Number(order.grand_total);
          }, 0),
        )
        .reduce((acc, total) => acc + total, 0);
      console.log(grandTotal);

      //
      const formattedGrandTotal = !isNaN(grandTotal)
        ? new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
          }).format(grandTotal)
        : 'Rp. 0';
      const totalRow = worksheet.addRow({
        id: 'Orders Grand Total',
        pic_name: '',
        company_name: '',
        email_address: '',
        phone_number: '',
        vendor_service: '',
        vendor_store: '',
        vendor_area: '',
        username: '',
        join_date: formattedGrandTotal,
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

      worksheet.mergeCells(`A${totalRow.number}:J${totalRow.number}`);

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName) => {
        const folderPath = './storage/excel/vendor';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }

        const excelFileName = `${baseName}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      const writeWorkbookAndSendResponse = async (
        workbook,
        excelFilePath,
        res,
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

      const generateExcelFile = async (data, res) => {
        const tanggalDalamFormat = getFormattedDate();
        const baseName = `DataVendor-${tanggalDalamFormat}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(data, res);
    } catch (error) {
      throw error;
    }
  }
}
