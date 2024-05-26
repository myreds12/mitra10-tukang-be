import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PermissionSeed() {
  const permission_name = ['CREATE', 'UPDATE', 'DELETE', 'READ', 'MANAGE'];
  const menu = await prisma.menus.findMany();

  const permissions = menu.map((item) => {
    return permission_name.map((name) => ({
      name,
      menu_id: item.id,
    }));
  });

  await prisma.permissions.createMany({
    data: permissions.flat(),
  });
}
