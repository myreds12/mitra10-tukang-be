import { Injectable } from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { InvoiceStatus } from 'src/invoices/dto/invoice-status.enum';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';
import { users } from '@prisma/client';
import { moduleRolesMapping, moduleTypeNotification } from './dto/notification-module-type.enum';

@Injectable()
export class NotificationsService {
  constructor(private readonly dbService: PrismaService) { }
  async create(data: any, action: string, created_by: number, module_type: moduleTypeNotification, module_id: number, status: number) {
    try {
      const relevantRoles = moduleRolesMapping[module_type];
      const json = JSON.stringify(data);
      const dataParse = JSON.parse(json);
      let sales_id, store_id, vendor_id;

      if (module_type !== moduleTypeNotification.INVOICE) {
        ({ sales_id, store_id, vendor_id } = dataParse.orders);
      } else {
        ({ vendor_id } = dataParse.invoices);
      }

      if (!relevantRoles || relevantRoles.length === 0) {
        console.log(`No roles found for module type: ${module_type}`);
        throw new Error(`No roles found for module type: ${module_type}`);
      }

      console.log("STORE: ", typeof store_id);
      console.log("SALES: ", typeof sales_id);
      console.log("Vendor: ", typeof vendor_id);
      const usersWithRoles = await this.dbService.users.findMany({
        where: {
          roles: {
            name: { in: relevantRoles },
          },
          OR: [
            {
              sales: {
                some: { id: sales_id ?? undefined }
              }
            },
            {
              store: {
                some: { id: store_id ?? undefined }
              }
            },
            {
              pic_vendor: {
                some: {
                  vendor_id: vendor_id ?? undefined
                }
              }
            }
          ],
        },
        select: { id: true },
      });
      console.log("usersWithRoles: ", usersWithRoles);

      const usersWithSpecialRoles = await this.dbService.users.findMany({
        where: {
          roles: {
            name: { in: ["Admin HO", "Super User"] },
          },
        },
        select: { id: true },
      });
      console.log("usersWithSpecialRoles: ", usersWithSpecialRoles);

      const allUserIds = [
        ...new Set([
          ...usersWithRoles.map(user => user.id),
          ...usersWithSpecialRoles.map(user => user.id),
        ]),
      ];
      console.log("allUserIds: ", allUserIds);

      if (!allUserIds.length) {
        console.log(`No users found with relevant roles for module type: ${module_type}`);
        throw new Error(`No users found with relevant roles for module type: ${module_type}`);
      }

      const notificationsData = allUserIds.map(user => ({
        data: JSON.stringify(data ?? {}),
        module_id,
        action,
        created_by,
        module_type,
        status,
        user_id: user,
      }));
      console.log("notificationsData: ", notificationsData);

      const notifications = await this.dbService.notifications.createMany({
        data: notificationsData,
      });
      console.log("notifications: ", notifications);

      return {
        message: `${notifications.count} notifications created successfully.`, // contoh respon
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
        ...(is_read != undefined ? {
          is_read: Boolean(is_read)
        } : undefined),
        ...(status ? {
          OR: [
            {
              module_type: { notIn: [moduleTypeNotification.INVOICE, moduleTypeNotification.INCENTIVE] },
              status: {
                in: status
              }
            },
            { module_type: { in: [moduleTypeNotification.INVOICE, moduleTypeNotification.INCENTIVE] } },
          ]
        } : undefined),
        user_id: user.id
      };

      const skip = page * take - take;
      let notifications = await this.dbService.notifications.findMany({
        skip,
        take: take > 0 ? take : undefined,
        orderBy: {
          created_at: 'desc'
        }
      });

      console.log("USER: ", user);


      const userIds = [
        ...new Set(
          notifications
            .flatMap((notification) => [
              notification.created_by
            ])
            .filter(Boolean),
        ),
      ];

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

      const userMap = users.reduce(
        (acc, user) => ({
          ...acc,
          [user.id]: user,
        }),
        {},
      );

      const statusIds = notifications
        .filter(notification => !["INVOICES", "SALES INCENTIVE"].includes(notification.module_type))
        .map(notification => notification.status)
        .filter(Boolean);

      const statuses = await this.dbService.status.findMany({
        where: { id: { in: statusIds } },
        select: { id: true, description: true },
      });

      const statusMap = statuses.reduce(
        (acc, status) => ({
          ...acc,
          [status.id]: status.description,
        }),
        {},
      );

      const roles = (
        await this.dbService.users.findUniqueOrThrow({
          where: { id: user.id },
          select: { roles: { select: { name: true } } },
        })
      ).roles.name

      console.log("ROLES: ", roles);


      const notificationWithUser = notifications
        .filter((notification) => {
          if (
            notification.module_type === "INVOICES" &&
            !(roles.includes('Owner Vendor') || roles.includes('Admin Vendor') || roles.includes('Admin HO'))
          ) {
            return false;
          }

          if (
            notification.module_type === "SALES INCENTIVE" &&
            (roles.includes('Owner Vendor') || roles.includes('Admin Vendor'))
          ) {
            return false;
          }

          return true;
        })
        .map((notification) => {
          let statusDescription = null;

          if (
            notification.module_type === "INVOICES" &&
            (roles.includes('Owner Vendor') || roles.includes('Admin Vendor') || roles.includes('Admin HO'))
          ) {
            statusDescription = InvoiceStatus[notification.status] || notification.status;
          } else if (
            notification.module_type === "SALES INCENTIVE" &&
            !(roles.includes('Owner Vendor') || roles.includes('Admin Vendor'))
          ) {
            statusDescription = IncentiveStatus[notification.status] || notification.status;
          } else if (!["INVOICES", "SALES INCENTIVE"].includes(notification.module_type)) {
            statusDescription = statusMap[notification.status] || null;
          }

          return {
            ...notification,
            created_by: notification.created_by ? userMap[notification.created_by] || null : null,
            ...(statusDescription !== null && { status_description: statusDescription }), // Tambahkan status_description hanya jika tidak null
          };
        });

      const count = await this.dbService.notifications.count({
        where
      });

      return {
        data: notificationWithUser,
        meta: {
          total: count,
          page,
          take,
          takeTotal: notificationWithUser.length,
        },
      }
    } catch (error) {
      throw error;
    }
  }

  async update(dto: UpdateNotificationDto[]) {
    try {
      console.log("DTO : ", dto);

      const notification = await this.dbService.notifications.updateMany({
        where: {
          id: {
            in: dto.map((x) => x.id),
          }
        },
        data: {
          is_read: true
        }
      });

      return {
        data: notification
      }
    } catch (error) {
      throw error
    }
  }
}

