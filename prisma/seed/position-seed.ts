import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PositionSeed() {
  const permission_name = [
    'Store CS',
    'Store Staff',
    'Admin HO',
    'Admin Vendor',
    'Tukang',
  ];
  const menu = await prisma.menus.findMany();

  const positions: Prisma.positionsCreateManyInput[] = permission_name.map(
    (item) => {
      return {
        position_name: item,
      };
    },
  );

  await prisma.positions.createMany({
    data: positions,
  });
}
