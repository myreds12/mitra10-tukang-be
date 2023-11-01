import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateTukangDto } from './dto/create-tukang.dto';
import { UpdateTukangDto } from './dto/update-tukang.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash } from 'bcrypt';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class TukangService {
  constructor(private readonly dbService: PrismaService) {}
  async create(
    createTukangDto: CreateTukangDto,
    user: users,
    files: TukangFiles,
  ) {
    const { id: user_id } = user;
    const tukangFiles: Array<Prisma.tukang_documentCreateManyInput> =
      Object.entries(files).map((file) => {
        if (file[0].length) {
          const newFile = file[1].map((item) => ({
            document_name: file[0],
            path: item.filename,
            created_by: user_id,
          }));

          return newFile;
        }
      });

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
      tukang_document: {
        createMany: {
          data: tukangFiles.flat(),
        },
      },
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

    return { tukang, userData };
  }

  async findAll(query: QueryParamsDto) {
    const { order_by, date_from, date_to, page, search, take } = query;
    const skip = page * take - take;
    const countTotal = await this.dbService.tukang.count();

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

    return { data: tukang, skip, take, page, countTotal };
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

    const tukangFiles: Array<Prisma.tukang_documentCreateManyInput> =
      Object.entries(files).map((file) => {
        if (file[0].length) {
          const newFile = file[1].map((item) => ({
            document_name: file[0],
            path: item.filename,
            created_by: user_id,
          }));

          return newFile;
        }
      });
    console.log(updateTukangDto.service_types);

    const updateTukangServiceType = updateTukangDto?.service_types
      .filter((x) => Boolean(x.id))
      .map(({ id, service_type_id }) => {
        return {
          where: { id },
          data: {
            service_type_id,
            updated_by: user_id,
          },
        };
      });

    const newTukangServiceType = {
      data: updateTukangDto.service_types
        .filter((x) => !Boolean(x.id))
        .map(({ service_type_id }) => ({
          service_type_id,
          created_by: user_id,
        })),
    };
    console.log(updateTukangServiceType, newTukangServiceType);

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
      tukang_document: {
        createMany: {
          data: tukangFiles.flat(),
        },
      },
      tukang_service: {
        update: updateTukangServiceType,
        createMany: newTukangServiceType,
      },
    };

    const [syncDocument, syncServiceType, tukang] =
      await this.dbService.$transaction([
        this.dbService.tukang_document.deleteMany({
          where: {
            tukang_id: id,
          },
        }),
        this.dbService.tukang_service.deleteMany({
          where: {
            tukang_id: id,
            NOT: updateTukangDto.service_types.map((item) => {
              return {
                service_type_id: item.service_type_id,
              };
            }),
          },
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
