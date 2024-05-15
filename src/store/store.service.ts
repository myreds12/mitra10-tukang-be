import { Injectable, HttpStatus, NotFoundException } from '@nestjs/common';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { hash } from 'bcrypt';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class StoreService {
  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}
  async create(dto: CreateStoreDto, user_id: number) {
    try {
      const store = await this.dbService.store.create({
        data: {
          store_name: dto.store_name,
          store_group_id: dto.store_group_id,
          bank_name: dto.bank_name,
          bank_account: dto.bank_account,
          bank_number: dto.bank_number,
          email: dto.email,
          phone_number_1: dto.phone_number_1,
          phone_number_2: dto.phone_number_2,
          address: dto.address,
          additional_address: dto.additional_address,
          area_id: dto.area_id,
          zip_code: dto.zip_code,
          created_by: user_id,
        },
      });
      const role = await this.dbService.roles.findFirst({
        where: {
          name: {
            equals: 'Store CS',
          },
        },
      });
      const username = dto.default_username
        ? dto.default_username
        : `${dto.store_name.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '_')}`;
      const user = await this.dbService.users.create({
        data: {
          username,
          password: await hash(dto?.default_password ?? 'password', 10),
          role_id: role.id,
        },
      });
      await this.emailQueue.add(
        'send-credential-mail',
        {
          username: username,
          password: dto.default_password,
        },
        {
          attempts: 3,
        },
      );

      return {
        status: HttpStatus.CREATED,
        message: 'Store Successfully Created',
        data: store,
        user,
      };
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to create',
      };
    }
  }

  async findAll(query: QueryParamsDto) {
    const {
      take,
      page,
      search,
      status,
      date_from,
      date_to,
      order_by,
      area_id,
      store_group_id,
    } = query;

    const skip = page * take - take;

    const where: Prisma.storeWhereInput = {
      AND: [
        ...(area_id
          ? [
              {
                OR: [{ area_id: { equals: area_id } }],
              },
            ]
          : []),
          ...(search
            ? [
              {
                OR: [
                  {
                    store_name: {
                      contains: search
                    }
                  },
                ],
              },
            ]
            : []),
          ...(store_group_id ? [
            {
              OR: [
                {store_group_id: { equals: store_group_id}}
              ]
            }
          ]: []),
      ],
      deleted_at: null,
    };

    const store = await this.dbService.store.findMany({
      where,
      skip,
      take: take <= 0 ? undefined : take,
      include: {
        area: true,
      },
    });

    const total = await this.dbService.store.count({
      where,
    });

    return {
      data: store,
      total,
      skip,
      page,
      take,
    };
  }

  async findOne(id: number) {
    try {
      const store = await this.dbService.store.findFirst({
        where: {
          id,
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Succesfully find store',
        data: store,
      };
    } catch (error) {}
  }

  async update(id: number, dto: UpdateStoreDto, user_id: number) {
    try {
      const store = await this.dbService.store.update({
        where: {
          id,
        },
        data: {
          store_name: dto.store_name,
          store_group_id: dto.store_group_id,
          bank_name: dto.bank_name,
          bank_account: dto.bank_account,
          bank_number: dto.bank_number,
          email: dto.email,
          phone_number_1: dto.phone_number_1,
          phone_number_2: dto.phone_number_2,
          address: dto.address,
          additional_address: dto.additional_address,
          area_id: dto.area_id,
          zip_code: dto.zip_code,
          updated_by: user_id,
          updated_at: new Date(),
        },
      });

      const role = await this.dbService.roles.findFirst({
        where: {
          name: {
            equals: 'Store CS',
          },
        },
      });
      const username = dto.default_username
        ? dto.default_username
        : `${dto.store_name.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '_')}`;
      const user = await this.dbService.users.create({
        data: {
          username,
          password: await hash(dto?.default_password ?? 'password', 10),
          role_id: role.id,
        },
      });

      await this.emailQueue.add(
        'send-credential-mail',
        {
          username: username,
          password: dto.default_password,
        },
        {
          attempts: 3,
        },
      );

      return {
        status: HttpStatus.CREATED,
        data: store,
        user,
        message: 'Successfully Update Data',
      };
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to update data',
      };
    }
  }

  async remove(id: number, user_id: number) {
    try {
      const store = await this.dbService.store.update({
        where: {
          id,
        },
        data: {
          deleted_by: user_id,
          deleted_at: new Date(),
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully delete store',
      };
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to delete store',
      };
    }
  }

  async getCode() {
    const stores = await this.dbService.store.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return stores[0] || null;
  }
}
