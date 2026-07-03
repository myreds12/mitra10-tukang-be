import { Injectable } from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { InvoiceStatus } from 'src/invoices/dto/invoice-status.enum';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';
import { users } from '@prisma/client';
import {
  moduleRolesMapping,
  moduleTypeNotification,
} from './dto/notification-module-type.enum';
import { QuotationPromotionStatus } from 'src/quotation_promotion/dto/quotation-promotion.status';

@Injectable()
export class NotificationsService {
  constructor(private readonly dbService: PrismaService) { }
  async create(
    data: any,
    action: string,
    created_by: number,
    module_type: moduleTypeNotification,
    module_id: number,
    status: number,
  ) {
    try {
      const relevantRoles = moduleRolesMapping[module_type];
      const json = JSON.stringify(data);
      const dataParse = JSON.parse(json);
      let sales_id, store_id, vendor_id, tukang_ids;

      let filteredRoles = relevantRoles;

      const notifDuplicate = await this.dbService.notifications.findMany({
        where: {
          module_id,
          module_type,
          status,
          action,
          created_at: {
            gte: new Date(Date.now() - 5000),
          },
        },
        take: 1,
      });

      if (notifDuplicate.length > 0) {
        return;
      }

      if (
        module_type === moduleTypeNotification.QUOTATION_PROMOTION ||
        module_type === moduleTypeNotification.VENDOR_REGISTRATION
      ) {
        filteredRoles = ['Admin HO', 'Super User'];
      } else if (
        module_type === moduleTypeNotification.INVOICE &&
        status === 5
      ) {
        filteredRoles = ['Finance'];
        ({ vendor_id } = dataParse.invoices);
      } else if (module_type !== moduleTypeNotification.INVOICE) {
        ({ sales_id, store_id, vendor_id } = dataParse.orders);

        const workOrders = await this.dbService.work_orders.findMany({
          where: { order_id: dataParse.orders.id },
          select: {
            work_order_tukang: {
              select: { tukang_id: true },
            },
          },
        });

        if (workOrders.length > 0) {
          tukang_ids = workOrders.flatMap((wo) =>
            wo.work_order_tukang.map((wot) => wot.tukang_id),
          );
        } else {
          tukang_ids = [];
        }
      } else {
        ({ vendor_id } = dataParse.invoices);
      }

      if (!relevantRoles || relevantRoles.length === 0) {
        throw new Error(`No roles found for module type: ${module_type}`);
      }

      const statusBookedPicklist = await this.dbService.status.findMany({
        where: {
          category: {
            in: ['BOOKED', 'PICKLIST'],
          },
        },
      });
      const bookedPicklistIds = statusBookedPicklist.map((status) => status.id);

      if (
        module_type === moduleTypeNotification.ORDER &&
        bookedPicklistIds.includes(status)
      ) {
        filteredRoles = relevantRoles.filter(
          (role) => !['Owner Vendor', 'Admin Vendor', 'Tukang'].includes(role),
        );
      }

      let usersWithRoles = [];

      if (
        ![
          moduleTypeNotification.QUOTATION_PROMOTION,
          moduleTypeNotification.VENDOR_REGISTRATION,
        ].includes(module_type)
      ) {
        // Cari user dengan roles dan relevansi ID jika bukan notification global admin.
        usersWithRoles = await this.dbService.users.findMany({
          where: {
            roles: {
              name: { in: filteredRoles },
            },
            OR: [
              {
                sales: {
                  some: { id: sales_id ?? undefined },
                },
              },
              {
                store: {
                  some: { id: store_id ?? undefined },
                },
              },
              {
                pic_vendor: {
                  some: { vendor_id: vendor_id ?? undefined },
                },
              },
              {
                tukang: {
                  some: { id: { in: tukang_ids ?? [] } },
                },
              },
            ],
          },
          select: { id: true },
        });
      }

      // Jika module_type adalah QUOTATION_PROMOTION, langsung cari Admin HO dan Super User
      const usersWithSpecialRoles = await this.dbService.users.findMany({
        where: {
          roles: {
            name: { in: ['Admin HO', 'Super User'] },
          },
        },
        select: { id: true },
      });

      const allUserIds = [
        ...new Set([
          ...usersWithRoles.map((user) => user.id),
          ...usersWithSpecialRoles.map((user) => user.id),
        ]),
      ];

      if (!allUserIds.length) {
        throw new Error(
          `No users found with relevant roles for module type: ${module_type}`,
        );
      }

      const notificationsData = allUserIds.map((user) => ({
        data: JSON.stringify(data ?? {}),
        module_id,
        action,
        created_by,
        module_type,
        status,
        user_id: user,
      }));

      const notifications = await this.dbService.notifications.createMany({
        data: notificationsData,
      });

      return {
        message: `${notifications.count} notifications created successfully.`,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto, user: users) {
    try {
      const { take, page, is_read, status } = query;
      const where = {
        ...(is_read != undefined
          ? {
            is_read: Boolean(is_read),
          }
          : undefined),
        ...(status
          ? {
            OR: [
              {
                module_type: {
                  notIn: [
                    moduleTypeNotification.INVOICE,
                    moduleTypeNotification.INCENTIVE,
                    moduleTypeNotification.QUOTATION_PROMOTION,
                    moduleTypeNotification.VENDOR_REGISTRATION,
                  ],
                },
                status: { in: status },
              },
              // { module_type: { in: [moduleTypeNotification.INVOICE, moduleTypeNotification.INCENTIVE, moduleTypeNotification.QUOTATION_PROMOTION] } },
            ],
          }
          : undefined),
        user_id: user.id,
      };

      const skip = page * take - take;
      let notifications = await this.dbService.notifications.findMany({
        where,
        skip,
        take: take > 0 ? take : undefined,
        orderBy: {
          created_at: 'desc',
        },
      });

      const userIds = [
        ...new Set(
          notifications
            .flatMap((notification) => [notification.created_by])
            .filter(Boolean),
        ),
      ];

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

      const userMap = users.reduce(
        (acc, user) => ({ ...acc, [user.id]: user }),
        {},
      );

      const statusIds = notifications
        .filter(
          (notification) =>
            !['INVOICES', 'SALES INCENTIVE', 'QUOTATION_PROMOTION', 'VENDOR_REGISTRATION'].includes(
              notification.module_type,
            ),
        )
        .map((notification) => notification.status)
        .filter(Boolean);

      const statuses = await this.dbService.status.findMany({
        where: { id: { in: statusIds } },
        select: { id: true, description: true },
      });

      const statusMap = statuses.reduce(
        (acc, status) => ({ ...acc, [status.id]: status.description }),
        {},
      );

      const roles = (
        await this.dbService.users.findUniqueOrThrow({
          where: { id: user.id },
          select: { roles: { select: { name: true } } },
        })
      ).roles.name;

      const notificationWithUser = notifications
        .filter((notification) => {
          if (
            notification.module_type === 'INVOICES' &&
            !(
              roles.includes('Owner Vendor') ||
              roles.includes('Admin Vendor') ||
              roles.includes('Admin HO')
            )
          ) {
            return false;
          }

          if (
            notification.module_type === 'SALES INCENTIVE' &&
            (roles.includes('Owner Vendor') || roles.includes('Admin Vendor'))
          ) {
            return false;
          }

          return true;
        })
        .map((notification) => {
          let statusDescription = null;

          if (
            notification.module_type === 'INVOICES' &&
            (roles.includes('Owner Vendor') ||
              roles.includes('Admin Vendor') ||
              roles.includes('Admin HO'))
          ) {
            statusDescription =
              InvoiceStatus[notification.status]?.replace(/_/g, ' ') ||
              notification.status;
          } else if (
            notification.module_type === 'INCENTIVE' &&
            !(roles.includes('Owner Vendor') || roles.includes('Admin Vendor'))
          ) {
            statusDescription =
              IncentiveStatus[notification.status]?.replace(/_/g, ' ') ||
              notification.status;
          } else if (notification.module_type === 'QUOTATION_PROMOTION') {
            statusDescription =
              QuotationPromotionStatus[notification.status]?.replace(
                /_/g,
                ' ',
              ) || notification.status;
          } else if (notification.module_type === 'VENDOR_REGISTRATION') {
            const registrationStatusMap = {
              1: 'Menunggu Approve',
              2: 'Proses Pitching',
              3: 'Disetujui',
              4: 'Ditolak',
            };
            statusDescription = registrationStatusMap[notification.status] || null;
          } else if (
            !['INVOICES', 'INCENTIVE', 'QUOTATION_PROMOTION', 'VENDOR_REGISTRATION'].includes(
              notification.module_type,
            )
          ) {
            statusDescription = statusMap[notification.status] || null;
          }

          return {
            ...notification,
            created_by: notification.created_by
              ? userMap[notification.created_by] || null
              : null,
            ...(statusDescription !== null && {
              status_description: statusDescription,
            }),
          };
        });

      const count = await this.dbService.notifications.count({
        where,
      });
      const unread = await this.dbService.notifications.count({
        where: {
          is_read: false,
          user_id: user.id,
        },
      });

      return {
        data: notificationWithUser,
        meta: {
          total: count,
          page,
          take,
          unread,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async update(dto: UpdateNotificationDto[], user: users) {
    try {
      const checkAll = dto.some((x) => x.check_all === 1);

      let updates;
      if (checkAll) {
        updates = dto.map(({ is_read }) => ({
          where: { user_id: user.id },
          data: { is_read: Boolean(is_read) },
        }));
      } else {
        updates = dto.map(({ id, is_read }) => ({
          where: { id },
          data: { is_read: Boolean(is_read) },
        }));
      }

      const updatePromises = updates.map((update) =>
        this.dbService.notifications.updateMany(update),
      );

      const results = await Promise.all(updatePromises);

      return {
        data: results,
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async delete(dto: UpdateNotificationDto[], user: users) {
    try {
      const deleteNotif = await this.dbService.notifications.deleteMany({
        where: {
          module_type: moduleTypeNotification.INVOICE,
          user_id: {
            not: user.id,
          },
        },
      });

      return deleteNotif;
    } catch (error) {
      throw error;
    }
  }
}
