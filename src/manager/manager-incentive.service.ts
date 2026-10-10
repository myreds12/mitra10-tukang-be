/* eslint-disable prettier/prettier */
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { users, Prisma } from '@prisma/client';
import * as exceljs from 'exceljs';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';
import { IncentiveType } from 'src/incentive/dto/incentive-type.enum';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';

@Injectable()
export class ManagerIncentiveService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly notifService: NotificationsService,
  ) {}

  private async findManager(id: number) {
    return this.dbService.manager.findFirst({
      where: { id },
      include: {
        bank: true,
        store: true,
        users: true,
      },
    });
  }

  async createInsetiveManager(createManagerDto: any, user: users) {
    try {
      // const { id: user_id } = user;
      const [sales] = await this.dbService.$transaction([
        this.dbService.manager_incentive.create({
          data: {
            incentive: {
              connect: { id: createManagerDto.incentive_id },
            },
            manager: {
              connect: { id: createManagerDto.manager_id },
            },
            nominal: new Prisma.Decimal(createManagerDto.nominal), // Pastikan ini string/Decimal, bukan number mentah
            status: createManagerDto.status ?? 0,
            notes: createManagerDto.notes ?? '',
            created_by: user.id,
          },
        }),
      ]);

      return sales;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }


  async getInsentive(query: QueryParamsDto) {
    try {
      const { take, page, date_from, date_to } = query;

      const skip = page * take - take;
      const where: Prisma.manager_incentiveWhereInput = {
        AND: [
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

      const count = await this.dbService.manager_incentive.count({
        where,
      });

      const getTake = () => {
        if (take <= 0) {
          return 100;
        }
        return take;
      };

      const sales = await this.dbService.manager_incentive.findMany({
        where,
        skip,
        take: getTake(),
      });

      const dataSales = sales.map((item) => {
        return {
          ...item,
        };
      });

      return {
        data: dataSales,
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


  async findOneInsetif(id: number) {
    try {

      const incetiveDetail = await this.dbService.manager_incentive.findFirst({
        where:{
          id: id
        }
      })
      // console.log(incetiveDetail);
      
      const sales = await this.dbService.manager.findFirst({
        where: {
          id: incetiveDetail.manager_id,
        },
        include: {
          bank: true,
          store: true,
      
          users: true,
        },
      });
      const data ={
        ...incetiveDetail,
        ...sales
      }
      return data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async syncManagerCommission(filePath: string, user: users) {
    try {
      const workbook = new exceljs.Workbook();
      await workbook.xlsx.readFile(filePath);

      const worksheet = workbook.worksheets[0];
      const managerOrderPairs = [];
      let updatedCount = 0;

      for (
        let rowNumber = 2;
        rowNumber <= worksheet.actualRowCount;
        rowNumber++
      ) {
        const manager_id = worksheet.getCell(`F${rowNumber}`).value as number;
        const order_id = worksheet.getCell(`A${rowNumber}`).value as number;
        const incentive_id = worksheet.getCell(`L${rowNumber}`).value as number;
        const notes = worksheet.getCell(`P${rowNumber}`).value;

        if (manager_id && order_id && incentive_id) {
          managerOrderPairs.push({
            manager_id,
            order_id,
            incentive_id,
            notes,
          });
        }
      }

      await Promise.all(
        managerOrderPairs.map(async (pair) => {
          const order = await this.dbService.orders.findFirst({
            where: {
              id: pair.order_id,
            },
            include: {
              quotation: true,
            },
          });

          if (!order) {
            console.warn(`Quotation with ID ${pair.order_id} not found.`);
            return;
          }

          const manager = await this.findManager(pair.manager_id);
          if (!manager) {
            console.warn(`Manager with ID ${pair.sales_id} not found.`);
            return;
          }

          const setting_incentive =
            await this.dbService.setting_incentive.findFirst({
              where: {
                id: pair.incentive_id,
              },
            });

          if (!setting_incentive) {
            console.warn(`Incentive with ID ${pair.incentive_id} not found.`);
            return;
          }

          const incentive = await this.dbService.manager_incentive.findFirst({
            where: {
              manager_id: manager.id,
              incentive_id: setting_incentive.id,
              status: IncentiveStatus.PENGAJUAN_INSENTIF,
            },
          });

          if (!incentive) {
            console.warn(`Sales Incentive  not found!`);
            return;
          }

          const updateManager = await this.dbService.manager_incentive.update({
            where: {
              id: incentive.id,
            },
            data: {
              status: IncentiveStatus.INSENTIF_DIBAYARKAN,
              notes: pair.notes ?? '',
              updated_at: new Date(),
              updated_by: user.id,
            },
          });
          await this.notifService.create(
            {
              sales_incentive: updateManager,
              orders: order,
            },
            'UPDATE',
            updateManager.updated_by,
            moduleTypeNotification.INCENTIVE,
            updateManager.id,
            updateManager.status,
          );
          updatedCount += 1;
        }),
      );

      return { count: updatedCount };
    } catch (error) {
      console.error('Error synchronizing commission status:', error);
      throw error;
    }
  }


  async updateDateManagerIncentive(id: number) {
    try {
      const ManagerIncentive = await this.dbService.sales_incentive.findFirst({
        where: {
          deleted_at: null,
          status: 2,
          id: id,
        },
        include: {
          incentive: true,
          quotation: true,
        },
      });
      const quotationManagerIncentive =
        await this.dbService.quotation.findFirst({
          where: {
            id: ManagerIncentive.quotation_id,
          },
          select: {
            order: {
              select: {
                order_history: {
                  where: {
                    status: {
                      category: 'WORKEND',
                    },
                  },
                  orderBy: {
                    created_at: 'desc',
                  },
                  include: {
                    status: true,
                  },
                },
              },
            },
          },
        });

      let comission = 0;
      if (ManagerIncentive.incentive.type === 1) {
        comission +=
          Number(ManagerIncentive.quotation.quotation_grand_total) *
          (Number(ManagerIncentive.incentive.incentive) / 100);
      } else if (ManagerIncentive.incentive.type === 2) {
        comission += Number(ManagerIncentive.incentive.incentive);
      }

      const updateManagerIncentive =
        await this.dbService.sales_incentive.update({
          where: {
            id: id,
          },
          data: {
            nominal: Math.floor(comission),
            created_at: new Date(
              quotationManagerIncentive.order.order_history[0].created_at,
            ),
          },
        });

      return updateManagerIncentive;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }


  async deleteManagerIncentive(id: number) {
    try {
      const deleteManagerIncentive =
        await this.dbService.manager_incentive.delete({
          where: {
            id: id,
          },
        });

      return deleteManagerIncentive;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
