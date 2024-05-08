import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateTukangDto } from './dto/create-tukang.dto';
import { UpdateTukangDto } from './dto/update-tukang.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash } from 'bcrypt';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { SendEmailService } from 'src/mails/send-email.service';

@Injectable()
export class TukangService {
  constructor(private readonly dbService: PrismaService, private readonly sendMailService: SendEmailService) { }
  async create(
    createTukangDto: CreateTukangDto,
    user: users,
    files: TukangFiles,
  ) {
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

    const userData = await this.dbService.users.create({
      data: {
        username: createTukangDto.username,
        password: await hash(createTukangDto.password, 10),
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
      }),
    ]);
    
    // await this.sendMailService.sendCredentialMail(createTukangDto.username,  createTukangDto.password);
    return { tukang, userData };
  }

  async findAll(query: QueryParamsDto) {
    const { order_by, date_from, vendor_id,date_to, page, search, take, search_date_from, search_date_to, service_types } = query;
    const skip = page * take - take;

    const where: Prisma.tukangWhereInput = {
      AND: [
        ...(search
          ? [
            {
              OR: [
                { address: { contains: search } },
                { email: { contains: search } },
                { phone_number: { contains: search } },
                { full_name: { contains: search } },
                { ktp_number: { contains: search } },
                { vendor: { company_name: { contains: search } } },
                {
                  tukang_service: {
                    every: {
                      service_type: { service_type: { contains: search } },
                    },
                  },
                },
                
              ],
            },
          ]
          : []),
          service_types ?  {
            tukang_service: {
              some: {
                service_type_id: {
                  in: service_types
                }
              }
            }
          }: undefined,
          vendor_id ? {
            vendor_id: vendor_id
          } : undefined,
          search_date_from && search_date_to ? {
              join_date: {
                gte: new Date(`${search_date_from}T00:00:00.000Z`),
                lte: new Date(`${search_date_to}T23:59:59.000Z`),
              }
          } : undefined,
        date_from && date_to
          ? {
            created_at: {
              gte: new Date(`${date_from}T00:00:00.000Z`),
              lte: new Date(`${date_to}T23:59:59.000Z`),
            },
          }
          : undefined,
      ],
      deleted_at: null,
    };

    const tukang = await this.dbService.tukang.findMany({
      where,
      skip,
      take: take <= 0 ? undefined : take,
      include: {
        users: true,
        vendor: true,
        tukang_service: {
          include: {
            service_type: true,
          },
        },
        tukang_document: true,
      },
    });
    const countTotal = await this.dbService.tukang.count({
      where,
    });

    return { data: tukang, skip, take, page, countTotal: countTotal };
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
          tukang_service: {
            include: {
              service_type: true,
            },
          },
          tukang_document: true,
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: tukang,
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data',
      };
    }
  }

  async update(
    id: number,
    updateTukangDto: UpdateTukangDto,
    user: users,
    files?: TukangFiles,
  ) {
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
    console.log(updateTukangDto.service_types);

    const tukangServiceTypesUpsert: Prisma.tukang_serviceUpsertWithWhereUniqueWithoutTukangInput[] = updateTukangDto.service_types.map((item) => ({
      where: {
        id: item.id ?? 0,
        tukang_id: id
      },
      create: {
        service_type_id: item.service_type_id,
        created_by: user_id,
      },
      update: {
        service_type_id: item.service_type_id,
        updated_by: user_id,
        updated_at: new Date()
      }
    }))

    const tukangUpdate: Prisma.tukangUpdateInput = {
      vendor: {
        connect: {
          id: updateTukangDto.vendor_id,
        },
      },
      email: updateTukangDto.email,
      full_name: updateTukangDto.full_name,
      ktp_number: updateTukangDto.ktp_number,
      join_date: updateTukangDto.join_date
        ? new Date(updateTukangDto.join_date)
        : undefined,
      address: updateTukangDto.address,
      phone_number: updateTukangDto.phone_number,
      bod: new Date(updateTukangDto.bod),
      tukang_service: {
        upsert: tukangServiceTypesUpsert
      },
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

    const [syncDocument, syncServiceType, tukang] =
      await this.dbService.$transaction([
        this.dbService.tukang_document.updateMany({
          where: {
            tukang_id: id,
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id
          }
        }),
        this.dbService.tukang_service.updateMany({
          where: {
            tukang_id: id,
            NOT: updateTukangDto.service_types
              ? updateTukangDto.service_types.map((item) => {
                return {
                  service_type_id: item.service_type_id,
                  id: item?.id
                };
              })
              : undefined,
          },
          data: {
            deleted_at: new Date(),
            deleted_by: user_id
          }
        }),
        this.dbService.tukang.update({
          where: {
            id,
          },
          data: tukangUpdate,
        }),
      ]);

    return tukang;
  }

  async remove(id: number, user_id: number) {
    try {
      const tukang = await this.dbService.tukang.update({
        where: {
          id,
        },
        data: {
          is_active: false,
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Delete Data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Delete Data',
      };
    }
  }

  async getCode() {
    const complaints = await this.dbService.tukang.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return complaints[0] || null;
  }
}
