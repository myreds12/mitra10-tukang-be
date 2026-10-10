/* eslint-disable prettier/prettier */
import {
  Injectable,
  HttpStatus,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { CreateManagerDto } from './dto/create-manager.dto';
import { UpdateManagerDto } from './dto/update-manager.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, roles, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { hash, hashSync } from 'bcrypt';
import { AuthService } from 'src/auth/auth.service';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';
import { IncentiveType } from 'src/incentive/dto/incentive-type.enum';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { ManagerExportService } from './manager-export.service';
import { ManagerIncentiveService } from './manager-incentive.service';

@Injectable()
export class ManagerService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly authService: AuthService,
    private notifService: NotificationsService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly managerExportService: ManagerExportService,
    private readonly managerIncentiveService: ManagerIncentiveService,
  ) {}

  async getCode() {
    try {
      const manager = await this.dbService.manager.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return manager[0] || null;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async create(createManagerDto: CreateManagerDto, user: users) {
    try {
      const { id: user_id } = user;
      console.log(user_id);
      let bank = null;

      if (createManagerDto.bank_id) {
        bank = await this.dbService.bank.findFirst({
          where: {
            id: createManagerDto.bank_id,
          },
        });

        if (bank.is_active == false)
          throw new HttpException(
            'Bank is not available',
            HttpStatus.BAD_REQUEST,
          );
      }

      const store = await this.dbService.store.findFirst({
        where: {
          id: createManagerDto.store_id,
        },
      });

      const MANAGER_ROLES = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'Manager Store',
          },
        },
      });
 
      // Deactivate other managers at this store
      await this.dbService.manager.updateMany({
        where: {
          store_id: createManagerDto.store_id,
          is_active: true,
        },
        data: {
          is_active: false,
        },
      });

      const saltedPassword = hashSync(
        createManagerDto?.password ?? 'password',
        12,
      );

      const formattedUsername =
        createManagerDto?.username?.replace(/ /g, '_') ?? null;

      const manager_data: Prisma.managerCreateInput = {
        full_name: createManagerDto.full_name,
        account_name: createManagerDto?.account_name,
        phone_number: createManagerDto?.phone_number,
        account_number: createManagerDto?.account_number,
        created_by: user_id,
        nik: createManagerDto?.nik,
        store: {
          connect: {
            id: createManagerDto?.store_id ?? undefined,
          },
        },
        bank: bank
          ? {
              connect: {
                id: createManagerDto.bank_id,
              },
            }
          : undefined,
        users: {
          connectOrCreate: {
            where: {
              username:
                formattedUsername ??
                `${createManagerDto.full_name
                  .toLowerCase()
                  .replace(/ /g, '_')}_${store.store_name
                  .toLowerCase()
                  .replace(/ /g, '_')}`,
              id: 0,
            },
            create: {
              username:
                formattedUsername ??
                `${createManagerDto.full_name
                  .toLowerCase()
                  .replace(/ /g, '_')}_${store.store_name
                  .toLowerCase()
                  .replace(/ /g, '_')}`,
              password: saltedPassword,
              role_id: MANAGER_ROLES.id,
            },
          },
        },

        is_active: true, // Ensure the new manager is active
      };

      const [manager] = await this.dbService.$transaction([
        this.dbService.manager.create({
          data: { ...manager_data },
          include: {
            users: true,
          },
        }),
      ]);

      this.emailQueue.add(
        'send-credential-mail',
        {
          username: manager?.users.username,
          password: createManagerDto?.password ?? 'password',
        },
        {
          attempts: 3,
        },
      );

      return manager;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const { search, take, page, date_from, date_to, store_id } = query;

      const skip = page * take - take;
      const where: Prisma.managerWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    {
                      id: !isNaN(+search) ? +search : undefined,
                    },
                    { full_name: { contains: search } },

                    { account_name: { contains: search } },
                    { phone_number: { contains: search } },
                    { account_number: { contains: search } },
                    { nik: { contains: search } },
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

      const count = await this.dbService.manager.count({
        where,
      });

      const getTake = () => {
        if (take <= 0 && !store_id) {
          return 100;
        }
        return take;
      };

      const manager = await this.dbService.manager.findMany({
        where,
        skip,
        take: getTake(),
        include: {
          bank: true,
          store: true,
          users: true,
        },
      });

      const dataManager = manager.map((item) => {
        return {
          ...item,
        };
      });

      return {
        data: dataManager,
        meta: {
          total: count,
          page,
          take: getTake(),
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
  async findOne(id: number) {
    try {
      const manager = await this.dbService.manager.findFirst({
        where: {
          id,
        },
        include: {
          bank: true,
          store: true,
          users: true,
        },
      });

      return manager;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(id: number, updateManagerDto: UpdateManagerDto, user: users) {
    try {
      const { id: user_id } = user;
      const manager = await this.dbService.manager.findFirst({
        where: {
          id,
        },
        include: {
          users: true,
          store: true,
        },
      });

      if (!manager) {
        throw new NotFoundException('Manager not found');
      }

      const MANAGER_ROLES: roles = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'Manager Store',
          },
        },
      });

      // Check if we're activating this manager
      if (updateManagerDto.is_active === 1) {
        // Deactivate other managers at this store
        await this.dbService.manager.updateMany({
          where: {
            store_id: updateManagerDto.store_id || manager.store_id,
            id: { not: id }, // Exclude the current manager being updated
            is_active: true,
          },
          data: {
            is_active: false,
            updated_at: new Date(),
            updated_by: user_id,
          },
        });
      }

      const managerUsername = updateManagerDto.full_name
        ? `${updateManagerDto.full_name
            .toLowerCase()
            .replace(/ /g, '_')}_${manager.store.store_name
            .toLowerCase()
            .replace(/ /g, '_')}`
        : manager?.users?.username;

      const managerPassword = updateManagerDto.password
        ? await hash(updateManagerDto.password, 12)
        : manager?.users?.password
        ? manager.users.password
        : await hash('password', 12);

      const managerData: Prisma.managerUpdateInput = {
        ...(manager.users &&
        updateManagerDto.username &&
        updateManagerDto.password
          ? {
              users: {
                update: {
                  where: {
                    id: manager?.user_id,
                  },
                  data: {
                    username: updateManagerDto?.username ?? managerUsername,
                    password: managerPassword,
                    updated_at: new Date(),
                    updated_by: user_id,
                  },
                },
              },
            }
          : updateManagerDto.username && updateManagerDto.password
          ? {
              users: {
                create: {
                  username: updateManagerDto?.username
                    ? updateManagerDto.username
                    : managerUsername,
                  password: managerPassword,
                  created_by: user_id,
                  created_at: new Date(),
                  role_id: MANAGER_ROLES.id,
                },
              },
            }
          : undefined),
        ...(updateManagerDto.bank_id
          ? {
              bank: {
                connect: {
                  id: updateManagerDto.bank_id,
                },
              },
            }
          : undefined),
        ...(updateManagerDto.store_id
          ? {
              store: {
                connect: {
                  id: updateManagerDto.store_id,
                },
              },
            }
          : undefined),
        account_name: updateManagerDto.account_name,
        account_number: updateManagerDto.account_number,
        phone_number: updateManagerDto.phone_number,
        full_name: updateManagerDto.full_name,
        nik: updateManagerDto.nik,
        is_active:
          updateManagerDto.is_active !== undefined
            ? Boolean(updateManagerDto.is_active)
            : manager.is_active,
        updated_at: new Date(),
        updated_by: user_id,
      };

      const updatedManager = await this.dbService.$transaction([
        this.dbService.manager.update({
          where: {
            id,
          },
          data: managerData,
          include: {
            users: true,
          },
        }),
      ]);

      this.emailQueue.add(
        'send-credential-mail',
        {
          username: managerUsername,
          password: updateManagerDto?.password ?? 'password',
        },
        {
          attempts: 3,
        },
      );

      return updatedManager[0];
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async managerUser(store_id: number) {
    try {
      const manager = await this.dbService.manager.findMany({
        take: 10,
        where: {
          store_id,
          is_active: true,
        },
        include: {
          users: true,
          store: true,
        },
      });

      return manager;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user: users) {
    try {
      const manager = await this.dbService.manager.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user.id,
          is_active: false,
        },
      });

      return manager;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }


  // ===================================
  // DELEGATED INCENTIVE METHODS
  // ===================================
  async createInsetiveManager(createManagerDto: any, user: users) {
    return this.managerIncentiveService.createInsetiveManager(createManagerDto, user);
  }

  async getInsentive(query: QueryParamsDto) {
    return this.managerIncentiveService.getInsentive(query);
  }

  async findOneInsetif(id: number) {
    return this.managerIncentiveService.findOneInsetif(id);
  }

  async syncManagerCommission(filePath: string, user: users) {
    return this.managerIncentiveService.syncManagerCommission(filePath, user);
  }

  async updateDateManagerIncentive(id: number) {
    return this.managerIncentiveService.updateDateManagerIncentive(id);
  }

  async deleteManagerIncentive(id: number) {
    return this.managerIncentiveService.deleteManagerIncentive(id);
  }

  // ===================================
  // DELEGATED EXPORT METHODS
  // ===================================
  async templateDefaultExcel(res: Response, query: QueryParamsDto) {
    return this.managerExportService.templateDefaultExcel(res, query);
  }

  async managerExportExcel(res: Response, queryParams: QueryParamsDto) {
    return this.managerExportService.managerExportExcel(res, queryParams);
  }
}
