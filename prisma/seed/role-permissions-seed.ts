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
      menu_id: { in: [2, 5, 16] },
    },
  });

  const permissionStoreCs = await prisma.permissions.findMany({
    where: {
      name: {
        in: ['UPDATE', 'READ'],
      },
      menu_id: { in: [2, 5, 16] },
    },
  });

  const permissionAdminHo = await prisma.permissions.findMany({
    where: {
      menu_id: { in: [] },
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
