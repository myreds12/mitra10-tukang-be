import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PermissionSeed() {
  const permission_name = ['CREATE', 'UPDATE', 'DELETE', 'READ', 'MANAGE'];
  const roles = await prisma.roles.findMany();

  const permissionStoreStaff = await prisma.permissions.findMany({
    where: {
      name: {
        in: ['CREATE', 'READ', 'UPDATE'],
      },
      menus: {
        title: {
          in: ['orders', 'complaints', 'reports'],
        },
      },
    },
  });

  const permissionStoreCs = await prisma.permissions.findMany({
    where: {
      name: {
        in: ['CREATE', 'READ', 'UPDATE'],
      },
      menus: {
        title: {
          in: ['orders', 'complaints', 'reports'],
        },
      },
    },
  });

  const permissionAdminHo = await prisma.permissions.findMany({
    where: {
      menus: {
        title: {
          in: [
            'Items',
            'Orders',
            'Tukang',
            'Vendor',
            'Complaints',
            'Employee',
            'Invoices',
            'CSI',
            'Work Order',
            'Member',
            'Quotation',
            'Remedials',
            'Store',
            'Auth',
            'Sales',
            'Reports',
          ],
        },
      },
    },
  });

  const permissionTukang = await prisma.permissions.findMany({
    where: {
      menu_id: { in: [] },
    },
  });

  // const permissions = menu.map((item) => {
  //   return permission_name.map((name) => ({
  //     name,
  //     menu_id: item.id,
  //   }));
  // });

  await prisma.role_permissions.createMany({
    data: [],
  });
}
