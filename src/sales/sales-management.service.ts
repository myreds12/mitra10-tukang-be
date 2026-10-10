/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { IncentiveType } from 'src/incentive/dto/incentive-type.enum';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';

@Injectable()
export class SalesManagementService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly notifService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async deleteOrder() {
    if ((process.env.NODE_APP_INSTANCE ?? '0') !== '0') return;
    try {
      const updatedSalesIncentives =
        await this.dbService.sales_incentive.findMany({
          where: {
            status: IncentiveStatus.POTENTIAL_INCENTIVE,
            quotation: {
              order: {
                status: {
                  category: 'WORKEND',
                },
              },
            },
          },
          select: {
            id: true,
            updated_by: true,
            status: true,
            quotation: {
              select: {
                order: {
                  select: {
                    id: true,
                    sales_id: true,
                    store_id: true,
                    vendor_id: true,
                  },
                },
              },
            },
          },
        });

      await this.dbService.sales_incentive.updateMany({
        where: {
          id: { in: updatedSalesIncentives.map((si) => si.id) },
        },
        data: {
          status: 2,
          created_at: new Date(),
        },
      });

      await Promise.all(
        updatedSalesIncentives.map(async (updateSales) => {
          const order = updateSales.quotation.order;

          if (order) {
            await this.notifService.create(
              {
                sales_incentive: updateSales,
                orders: order,
              },
              'UPDATE',
              updateSales.updated_by,
              moduleTypeNotification.INCENTIVE,
              updateSales.id,
              updateSales.status,
            );
          }
        }),
      );

      return {
        message: `${updatedSalesIncentives.length} sales incentives updated and notifications created successfully.`,
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async salesUserManagement() {
    if ((process.env.NODE_APP_INSTANCE ?? '0') !== '0') return;
    try {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const targetYear = threeMonthsAgo.getFullYear();
      const targetMonth = threeMonthsAgo.getMonth();

      const endOfTargetMonth = new Date(targetYear, targetMonth + 1, 0);
      endOfTargetMonth.setHours(23, 59, 59, 999);

      const batchSize = 100;

      const salesToUpdate = await this.dbService.sales.findMany({
        where: {
          NOT: {
            orders: {
              some: {
                created_at: {
                  gte: endOfTargetMonth,
                },
              },
            },
          },
          is_active: true,
        },
        select: {
          id: true,
        },
        take: batchSize,
      });

      const salesIds = salesToUpdate.map((sales) => sales.id);

      if (salesIds.length === 0) {
        console.log('No sales to update in this batch.');
        return;
      }

      const salesUpdate = await this.dbService.sales.updateMany({
        where: {
          id: {
            in: salesIds,
          },
        },
        data: {
          is_active: false,
        },
      });

      return salesUpdate;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async managementSalesSixMonth() {
    if ((process.env.NODE_APP_INSTANCE ?? '0') !== '0') return;
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const targetYear = sixMonthsAgo.getFullYear();
      const targetMonth = sixMonthsAgo.getMonth();

      const endOfTargetMonth = new Date(targetYear, targetMonth + 1, 0);
      endOfTargetMonth.setHours(23, 59, 59, 999);

      const batchSize = 200;
      const salesToUpdate = await this.dbService.sales.findMany({
        where: {
          NOT: {
            orders: {
              some: {
                created_at: {
                  gte: endOfTargetMonth,
                },
              },
            },
          },
          is_active: true,
        },
        select: {
          id: true,
        },
        take: batchSize,
      });

      const salesIds = salesToUpdate.map((sales) => sales.id);

      if (salesIds.length === 0) {
        console.log('No sales to update in this batch.');
        return;
      }

      console.log('SALES TO UPDATE (BATCH):', salesIds);

      const salesIncentive = await this.dbService.sales.updateMany({
        where: {
          id: {
            in: salesIds,
          },
        },
        data: {
          is_active: false,
          deleted_at: new Date(),
        },
      });

      console.log('SALES UPDATED', salesIncentive);

      const usersUpdate = await this.dbService.users.updateMany({
        where: {
          sales: {
            some: {
              id: {
                in: salesIds,
              },
            },
          },
        },
        data: {
          is_active: false,
          deleted_at: new Date(),
        },
      });

      console.log('USERS UPDATED', usersUpdate);

      return { salesIncentive, usersUpdate };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async apiManagementSales(range_date: 7 | 4) {
    try {
      const rangeMonthAgo = new Date();
      rangeMonthAgo.setMonth(rangeMonthAgo.getMonth() - range_date);

      const targetYear = rangeMonthAgo.getFullYear();
      const targetMonth = rangeMonthAgo.getMonth();

      const endOfTargetMonth = new Date(targetYear, targetMonth + 1, 0);
      endOfTargetMonth.setHours(23, 59, 59, 999);

      const batchSize = 200;
      const salesToUpdate = await this.dbService.sales.findMany({
        where: {
          NOT: {
            orders: {
              some: {
                created_at: {
                  gte: endOfTargetMonth,
                },
              },
            },
          },
          is_active: true,
        },
        select: {
          id: true,
        },
        take: batchSize,
      });

      const salesIds = salesToUpdate.map((sales) => sales.id);

      if (salesIds.length === 0) {
        console.log('No sales to update in this batch.');
        return;
      }

      // Step 2: Update sales dengan batch size
      let salesUser: any, usersUpdate: any;
      if (range_date === 7) {
        salesUser = await this.dbService.sales.updateMany({
          where: {
            id: {
              in: salesIds,
            },
          },
          data: {
            is_active: false,
            deleted_at: new Date(),
          },
        });

        usersUpdate = await this.dbService.users.updateMany({
          where: {
            sales: {
              some: {
                id: {
                  in: salesIds,
                },
              },
            },
          },
          data: {
            is_active: false,
            deleted_at: new Date(),
          },
        });
      } else if (range_date === 4) {
        salesUser = await this.dbService.sales.updateMany({
          where: {
            id: {
              in: salesIds,
            },
          },
          data: {
            is_active: false,
          },
        });
      }

      return { salesIncentive: salesUser, usersUpdate };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async updateDateSalesIncentive(id: number) {
    try {
      const salesIncentive = await this.dbService.sales_incentive.findFirst({
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
      const quotationSalesIncentive = await this.dbService.quotation.findFirst({
        where: {
          id: salesIncentive.quotation_id,
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
      if (salesIncentive.incentive.type === 1) {
        comission +=
          Number(salesIncentive.quotation.quotation_grand_total) *
          (Number(salesIncentive.incentive.incentive) / 100);
      } else if (salesIncentive.incentive.type === 2) {
        comission += Number(salesIncentive.incentive.incentive);
      }

      const updateSalesIncentive = await this.dbService.sales_incentive.update({
        where: {
          id: id,
        },
        data: {
          nominal: Math.floor(comission),
          created_at: new Date(
            quotationSalesIncentive.order.order_history[0].created_at,
          ),
        },
      });

      return updateSalesIncentive;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async deleteSalesIncentive(id: number) {
    try {
      const deleteSalesIncentive = await this.dbService.sales_incentive.delete({
        where: {
          id: id,
        },
      });

      return deleteSalesIncentive;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

}
