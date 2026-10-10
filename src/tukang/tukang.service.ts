/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateTukangDto } from './dto/create-tukang.dto';
import { UpdateTukangDto } from './dto/update-tukang.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hashSync } from 'bcrypt';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { PdfService } from 'src/common/service/pdf.service';
import { TukangExportService } from './tukang-export.service';

@Injectable()
export class TukangService {
  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
    private pdfService: PdfService,
    private readonly tukangExportService: TukangExportService,
  ) {}
  async create(
    createTukangDto: CreateTukangDto,
    user: users,
    files: TukangFiles,
  ) {
    try {
      const { id: user_id } = user;
      const tukangFiles: Array<Prisma.tukang_documentCreateManyInput> = files
        ? Object.entries(files).map((file) => {
            if (file[0].length) {
              const newFile = file[1].map((item) => ({
                document_name: file[0],
                path: item.filename,
                created_by: user_id,
              }));

              return newFile;
            }
          })
        : undefined;

      const roles = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'tukang',
          },
        },
      });

      const tukangServiceTypes: Prisma.tukang_serviceCreateManyTukangInput[] =
        createTukangDto.service_types
          ? createTukangDto.service_types.map((item) => {
              return {
                service_type_id: item.service_type_id,
                created_by: user_id,
              };
            })
          : undefined;

      const tukangArea: Prisma.tukang_areaCreateManyTukangInput[] =
        createTukangDto.tukang_area
          ? createTukangDto.tukang_area.map((item) => {
              return {
                area_id: item.area_id,
                created_by: user_id,
              };
            })
          : undefined;

      const saltedPassword = hashSync(
        createTukangDto?.password ?? 'password',
        12,
      );

      const formattedUsername =
        createTukangDto?.username?.replace(/ /g, '_') ?? undefined;

      const userData = await this.dbService.users.create({
        data: {
          username:
            formattedUsername ??
            `${createTukangDto.full_name.toLowerCase().replace(/ /g, '_')}`,
          password: saltedPassword,
          role_id: roles.id,
        },
      });

      const tukangData: Prisma.tukangCreateInput = {
        users: {
          connect: {
            id: userData.id,
          },
        },
        vendor: {
          connect: {
            id: createTukangDto.vendor_id,
          },
        },
        email: createTukangDto.email,
        full_name: createTukangDto.full_name,
        ktp_number: createTukangDto.ktp_number,
        join_date: createTukangDto.join_date
          ? new Date(createTukangDto.join_date)
          : undefined,
        address: createTukangDto.address,
        phone_number: createTukangDto.phone_number,
        bod: new Date(createTukangDto.bod),
        ...(tukangFiles
          ? {
              tukang_document: {
                createMany: {
                  data: tukangFiles.flat(),
                },
              },
            }
          : undefined),
        ...(tukangArea
          ? {
              tukang_area: {
                createMany: {
                  data: tukangArea,
                },
              },
            }
          : undefined),
        ...(tukangServiceTypes
          ? {
              tukang_service: {
                createMany: {
                  data: tukangServiceTypes,
                },
              },
            }
          : undefined),
      };

      const [tukang] = await this.dbService.$transaction([
        this.dbService.tukang.create({
          data: tukangData,
          include: {
            users: true,
          },
        }),
      ]);
      this.emailQueue.add(
        'send-credential-mail',
        {
          username: tukang?.users.username,
          password: createTukangDto?.password ?? 'password',
        },
        {
          attempts: 3,
        },
      );

      // await this.sendEmailService.sendCredentialMail(createTukangDto.username,  createTukangDto.password);
      return { data: tukang, meta: { user: userData } };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const {
        date_from,
        vendor_id,
        date_to,
        page,
        search,
        take,
        search_date_from,
        search_date_to,
        service_types,
        area_id,
      } = query;
      const skip = page * take - take;

      const whereConditions = [
          ...(search
            ? [
                {
                  OR: [
                    {
                      id: !isNaN(+search) ? +search : undefined,
                    },
                    {
                      tukang_area: {
                        some: {
                          area: {
                            area: {
                              contains: search,
                            },
                          },
                        },
                      },
                    },
                    { address: { contains: search } },
                    { email: { contains: search } },
                    { phone_number: { contains: search } },
                    { full_name: { contains: search } },
                    { ktp_number: { contains: search } },
                    {
                      full_name: {
                        contains: search,
                      },
                    },
                    { vendor: { company_name: { contains: search } } },
                    {
                      tukang_service: {
                        some: {
                          service_type: { service_type: { contains: search } },
                        },
                      },
                    },
                  ],
                },
              ]
            : []),
          service_types
            ? {
                tukang_service: {
                  some: {
                    service_type_id: {
                      in: service_types,
                    },
                  },
                },
              }
            : undefined,
          area_id
            ? {
                tukang_area: {
                  some: {
                    area_id: {
                      in: area_id,
                    },
                  },
                },
              }
            : undefined,
          vendor_id
            ? {
                vendor_id: vendor_id,
              }
            : undefined,
          search_date_from && search_date_to
            ? {
                join_date: {
                  gte: new Date(`${search_date_from}T00:00:00.000Z`),
                  lte: new Date(`${search_date_to}T23:59:59.000Z`),
                },
              }
            : undefined,
          date_from && date_to
            ? {
                created_at: {
                  gte: new Date(`${date_from}T00:00:00.000Z`),
                  lte: new Date(`${date_to}T23:59:59.000Z`),
                },
              }
            : undefined,
          {
            deleted_at: null,
          },
        ].filter(Boolean) as Prisma.tukangWhereInput[];

      const where: Prisma.tukangWhereInput = {
        AND: whereConditions,
      };

      const tukang = await this.dbService.tukang.findMany({
        where,
        skip,
        take: take <= 0 ? undefined : take,
        include: {
          users: true,
          vendor: true,
          work_order_tukang: {
            where: {
              deleted_at: null,
            },
            orderBy: {
              created_at: 'desc',
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
          tukang_area: {
            include: {
              area: true,
              tukang: true,
            },
          },
          tukang_service: {
            include: {
              service_type: true,
            },
          },
          tukang_document: true,
        },
      });

      const tukangWithSlotOrder = tukang.map((tukangItem) => {
        const dailySlots = tukangItem.work_order_tukang.filter((item) => {
          const orderDate = new Date(
            item.work_orders.work_order_status[0].created_at,
          )
            .toISOString()
            .split('T')[0];
          const currentDate = new Date().toISOString().split('T')[0];
          // console.log("ORDER DATE:" ,orderDate, "CURRENT DATE: ",currentDate);

          return (
            item.work_orders.status.category !== 'SURVEYDONE' &&
            item.work_orders.status.category !== 'WORKEND' &&
            orderDate === currentDate
          );
        });

        return {
          ...tukangItem,
          slot_order: dailySlots.length,
        };
      });

      const countTotal = await this.dbService.tukang.count({
        where,
      });

      return {
        data: tukangWithSlotOrder,
        meta: { skip, take, page, countTotal: countTotal },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const tukang = await this.dbService.tukang.findFirst({
        where: {
          id,
        },
        include: {
          users: true,
          vendor: true,
          work_order_tukang: {
            where: {
              deleted_at: null,
            },
            orderBy: {
              created_at: 'desc',
            },
            include: {
              work_orders: {
                include: {
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
          tukang_area: {
            include: {
              area: true,
              tukang: true,
            },
          },
          tukang_service: {
            include: {
              service_type: true,
            },
          },
          tukang_document: true,
        },
      });

      return tukang;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(
    id: number,
    updateTukangDto: UpdateTukangDto,
    user: users,
    files?: TukangFiles,
  ) {
    try {
      console.log(updateTukangDto);
      const { id: user_id } = user;
      const tukang = await this.dbService.tukang.findFirst({
        where: {
          id,
        },
        include: {
          users: true,
        },
      });

      const tukangFiles: Array<Prisma.tukang_documentCreateManyInput> = files
        ? Object.entries(files).map((file) => {
            if (file[0].length) {
              const newFile = file[1].map((item) => ({
                document_name: file[0],
                path: item.filename,
                created_by: user_id,
              }));

              return newFile;
            }
          })
        : undefined;

      const tukangServiceTypesUpsert: Prisma.tukang_serviceUpsertWithWhereUniqueWithoutTukangInput[] =
        updateTukangDto.service_types
          ? updateTukangDto.service_types.map((item) => ({
              where: {
                id: item.id ?? 0,
                tukang_id: id,
              },
              create: {
                service_type_id: item.service_type_id,
                created_by: user_id,
              },
              update: {
                service_type_id: item.service_type_id,
                updated_by: user_id,
                updated_at: new Date(),
              },
            }))
          : undefined;

      const tukangAreaUpsert: Prisma.tukang_areaUpsertWithWhereUniqueWithoutTukangInput[] =
        updateTukangDto.tukang_area
          ? updateTukangDto.tukang_area.map((item) => ({
              where: {
                id: item.id ?? 0,
                tukang_id: id,
              },
              create: {
                area_id: item.area_id,
                created_by: user_id,
              },
              update: {
                area_id: item.area_id,
                updated_by: user_id,
                updated_at: new Date(),
              },
            }))
          : undefined;

      const tukangUpdate: Prisma.tukangUpdateInput = {
        ...(updateTukangDto?.vendor_id
          ? {
              vendor: {
                connect: {
                  id: updateTukangDto.vendor_id,
                },
              },
            }
          : undefined),
        email: updateTukangDto?.email,
        full_name: updateTukangDto?.full_name,
        ktp_number: updateTukangDto?.ktp_number,
        join_date: updateTukangDto?.join_date
          ? new Date(updateTukangDto.join_date)
          : undefined,
        address: updateTukangDto?.address,
        phone_number: updateTukangDto?.phone_number,
        bod: updateTukangDto?.bod ? new Date(updateTukangDto.bod) : undefined,
        is_active: Boolean(updateTukangDto.is_active),
        ...(updateTukangDto.is_delete === 1
          ? {
              deleted_at: new Date(),
              users: {
                update: {
                  deleted_at: new Date(),
                  deleted_by: user_id,
                },
              },
            }
          : {
              deleted_at: null,
              users: {
                update: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
            }),
        ...(tukangServiceTypesUpsert
          ? {
              tukang_service: {
                upsert: tukangServiceTypesUpsert,
              },
            }
          : undefined),
        ...(tukangAreaUpsert
          ? {
              tukang_area: {
                upsert: tukangAreaUpsert,
              },
            }
          : undefined),
        ...(tukangFiles
          ? {
              tukang_document: {
                createMany: {
                  data: tukangFiles.flat(),
                },
              },
            }
          : undefined),
      };

      const data = await this.dbService.$transaction([
        ...(updateTukangDto.is_active != null
          ? [
              this.dbService.tukang_document.updateMany({
                where: {
                  tukang_id: id,
                },
                data: {
                  deleted_at: new Date(),
                  deleted_by: user_id,
                },
              }),
            ]
          : []),
        ...(updateTukangDto.tukang_area
          ? [
              this.dbService.tukang_area.deleteMany({
                ...(updateTukangDto.tukang_area
                  ? {
                      where: {
                        tukang_id: id,
                      },
                    }
                  : undefined),
              }),
            ]
          : []),
        ...(updateTukangDto.service_types
          ? [
              this.dbService.tukang_service.deleteMany({
                ...(updateTukangDto.service_types
                  ? {
                      where: {
                        tukang_id: id,
                      },
                    }
                  : undefined),
              }),
            ]
          : []),
        this.dbService.tukang.update({
          where: {
            id,
          },
          data: tukangUpdate,
        }),
      ]);

      const formattedUsername = updateTukangDto?.username
        ? updateTukangDto?.username.replace(/ /g, '_')
        : tukang.users.username;

      const saltedPassword = updateTukangDto.password
        ? hashSync(updateTukangDto?.password, 12)
        : tukang.users.password;

      await this.dbService.users.update({
        where: {
          id: tukang.user_id,
        },
        data: {
          username:
            formattedUsername ??
            `${updateTukangDto?.full_name?.toLowerCase().replace(/ /g, '_')}`,
          password: saltedPassword,
        },
      });

      return data[0];
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    try {
      const tukangToDelete = await this.dbService.tukang.update({
        where: {
          id,
        },
        data: {
          is_active: false,
          deleted_at: new Date(),
          deleted_by: user_id,

          users: {
            update: {
              is_active: false,
              deleted_at: new Date(),
              deleted_by: user_id,
            },
          },
        },
      });

      return tukangToDelete;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async getCode() {
    try {
      const complaints = await this.dbService.tukang.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return complaints[0] || null;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }


  async tukangExportExcel(res: Response, queryParams: QueryParamsDto) {
    const { data } = await this.findAll(queryParams);
    return this.tukangExportService.tukangExportExcel(res, data);
  }

  async tukangOrderPdf(res: Response, queryParams: QueryParamsDto) {
    return this.tukangExportService.tukangOrderPdf(res, queryParams);
  }

  async tukangExportOrderExcel(res: Response, queryParams: QueryParamsDto) {
    return this.tukangExportService.tukangExportOrderExcel(res, queryParams);
  }

  async deleteDuplicateRelationTukang(
    tukang_id: number,
    type: 'service_type' | 'area',
    take: number,
  ) {
    try {
      if (type === 'service_type') {
        const tukangServiceTypes = await this.dbService.tukang_service.findMany(
          {
            where: {
              tukang_id,
            },
            take: take > 0 ? take : undefined,
          },
        );

        const uniqueServiceTypes = new Set();
        const duplicateServiceTypes = [];

        for (const serviceType of tukangServiceTypes) {
          if (uniqueServiceTypes.has(serviceType.service_type_id)) {
            duplicateServiceTypes.push(serviceType.id);
          } else {
            uniqueServiceTypes.add(serviceType.service_type_id);
          }
        }

        if (duplicateServiceTypes.length > 0) {
          await this.dbService.tukang_service.deleteMany({
            where: {
              id: { in: duplicateServiceTypes },
            },
          });
        }
      } else if (type === 'area') {
        const tukangAreas = await this.dbService.tukang_area.findMany({
          where: {
            tukang_id,
          },
          take: take > 0 ? take : undefined,
        });

        const uniqueAreas = new Set();
        const duplicateAreas = [];

        for (const area of tukangAreas) {
          if (uniqueAreas.has(area.area_id)) {
            duplicateAreas.push(area.id);
          } else {
            uniqueAreas.add(area.area_id);
          }
        }

        if (duplicateAreas.length > 0) {
          await this.dbService.tukang_area.deleteMany({
            where: {
              id: { in: duplicateAreas },
            },
          });
        }
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

}
