/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';

@Injectable()
export class OrderSchedulerService {
  private readonly logger = new Logger(OrderSchedulerService.name);

  constructor(
    private readonly dbService: PrismaService,
    private readonly notifService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkStatus() {
    if ((process.env.NODE_APP_INSTANCE ?? '0') !== '0') return;
    try {
      const status = await this.dbService.status.findFirst({
        where: {
          category: {
            contains: 'BOOK',
          },
        },
      });

      const statusUnpaid = await this.dbService.status.findFirst({
        where: {
          category: {
            contains: 'UNPAID',
          },
        },
      });

      const date = new Date();
      const thirdDateTime = new Date(date.setDate(date.getDate() - 3));
      const expiredBookedOrders = await this.dbService.orders.findMany({
        where: {
          status: {
            id: status.id,
          },
          created_at: {
            lt: thirdDateTime,
          },
        },
      });

      await this.dbService.orders.updateMany({
        where: {
          id: {
            in: expiredBookedOrders.map((order) => order.id),
          },
        },
        data: {
          project_status_id: statusUnpaid.id,
        },
      });

      await Promise.all(
        expiredBookedOrders.map((order) =>
          this.notifService.create(
            {
              orders: {
                ...order,
                project_status_id: statusUnpaid.id,
              },
            },
            'UPDATE',
            order.updated_by ?? order.created_by,
            moduleTypeNotification.ORDER,
            order.id,
            statusUnpaid.id,
          ),
        ),
      );
    } catch (error) {
      this.logger.error('Error checkStatus cron:', error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async deleteOrder() {
    if ((process.env.NODE_APP_INSTANCE ?? '0') !== '0') return;
    try {
      const status = await this.dbService.status.findFirst({
        where: {
          category: 'PICKLIST',
        },
      });

      if (!status) {
        throw new Error('Status not found');
      }

      const orderIds = await this.dbService.orders.findMany({
        where: {
          project_status_id: status.id,
        },
        select: {
          id: true,
        },
      });

      const orderIdsArray = orderIds.map((order) => order.id);

      // Use Prisma transaction to delete related entries first and then the orders
      const deleteOrdersTransaction = await this.dbService.$transaction([
        this.dbService.order_files.deleteMany({
          where: {
            order_id: { in: orderIdsArray },
          },
        }),
        this.dbService.order_histories.deleteMany({
          where: {
            order_id: { in: orderIdsArray },
          },
        }),
        this.dbService.m_order_details.deleteMany({
          where: {
            order_id: { in: orderIdsArray },
          },
        }),
        this.dbService.orders.deleteMany({
          where: {
            id: { in: orderIdsArray },
          },
        }),
      ]);

      return deleteOrdersTransaction;
    } catch (error) {
      this.logger.error('Error deleteOrder cron:', error);
      throw error;
    }
  }
}
