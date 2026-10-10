/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, users } from '@prisma/client';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { ViolationDetectorService } from 'src/common/services/violation-detector.service';
import { OrderQueryService } from './order-query.service';

@Injectable()
export class OrderStatusService {
  private readonly logger = new Logger(OrderStatusService.name);

  constructor(
    private readonly dbService: PrismaService,
    private readonly notifService: NotificationsService,
    private readonly violationDetector: ViolationDetectorService,
    private readonly orderQueryService: OrderQueryService,
  ) {}

  async setStatus(id: number, status_id: number, user: users) {
    try {
      const order = await this.orderQueryService.findOne(id);

      if (!order) throw new BadRequestException('Order does not Exist!');

      const [STATUS] = await this.dbService.status.findMany({
        where: {
          id: status_id,
        },
        orderBy: {
          category: 'desc',
        },
      });

      const orderData: Prisma.ordersUpdateInput = {
        status: {
          connect: {
            id: STATUS.id,
          },
        },
      };

      const [orders] = await this.dbService.$transaction([
        this.dbService.orders.update({
          where: {
            id,
          },
          data: orderData,
          include: {
            work_orders: {
              include: {
                work_order_tukang: true,
              },
            },
          },
        }),
      ]);

      if (orders) {
        await this.notifService.create(
          { orders: orders },
          'UPDATE',
          user.id,
          moduleTypeNotification.ORDER,
          orders.id,
          orders.project_status_id,
        );

        // =========================================
        // VENDOR VIOLATION TRIGGER
        // Check jika vendor mengkonfirmasi order (status berubah dari unconfirmed ke confirmed)
        // =========================================
        await this.checkOrderConfirmationViolation(order, STATUS, orders);
      }

      await this.addHistory(orders.id, orders.project_status_id, user, orders);

      return orders;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Check pelanggaran konfirmasi order
   * Jika status berubah dari unconfirmed ke confirmed, pelanggaran batal dicatat
   */
  async checkOrderConfirmationViolation(
    previousOrder: any,
    newStatus: any,
    updatedOrder: any,
  ): Promise<void> {
    try {
      // Status yang mengindikasikan vendor sudah mengkonfirmasi
      const confirmedStatuses = [
        'QUOTEIN',
        'QUOTEOUT',
        'WORKREQ',
        'SURVEYREQ',
        'TUKANGSURVEY',
        'SURVEYDONE',
        'WORKSTART',
        'WORKEND',
      ];

      const isNowConfirmed = confirmedStatuses.some((s) =>
        newStatus.category?.toUpperCase().includes(s),
      );

      // Jika vendor mengkonfirmasi order, tidak ada pelanggaran
      if (isNowConfirmed && previousOrder?.vendor_id) {
        this.logger.debug(
          `Order ${updatedOrder.id} confirmed by vendor ${previousOrder.vendor_id}. No violation recorded.`,
        );
        return;
      }

      // Jika order punya vendor dan belum dikonfirmasi
      if (updatedOrder.vendor_id && !isNowConfirmed) {
        const createdAt = new Date(updatedOrder.created_at);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const daysDiff = Math.floor(
          (today.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000),
        );

        // Catat pelanggaran jika sudah > 0 hari (Hari H)
        if (daysDiff >= 0 && previousOrder?.vendor_id) {
          await this.violationDetector.recordViolation('ORDER_NOT_CONFIRMED_H', {
            vendorId: updatedOrder.vendor_id,
            orderId: updatedOrder.id,
            description: `Order #${updatedOrder.project_number || updatedOrder.id} tidak dikonfirmasi pada Hari H`,
            evidence: {
              provenance: 'SYSTEM_GENERATED',
              snapshot: {
                orderId: updatedOrder.id,
                daysSinceCreated: daysDiff,
                triggeredAt: new Date().toISOString(),
              },
            },
          });
        }
      }
    } catch (error) {
      this.logger.error('Error checking order confirmation violation', error);
    }
  }

  async addHistory(
    id: number,
    status_id: number,
    user: users,
    payload: any,
  ): Promise<void> {
    try {
      await this.dbService.order_histories.create({
        data: {
          order_id: id,
          status_id: status_id,
          payload: JSON.stringify(payload),
          created_by: user.id,
        },
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async deleteHistory(id: number) {
    try {
      const history = await this.dbService.order_histories.delete({
        where: {
          id: id,
        },
      });
      return history;
    } catch (error) {
      throw error;
    }
  }
}
