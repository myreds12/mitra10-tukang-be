import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export async function RolesSeed() {
  await prisma.roles.createMany({
    data: [
      {
        name: 'Store CS',
      },
      {
        name: 'Store Staff',
      },
      {
        name: 'Admin HO',
      },
      {
        name: 'Tukang',
      },
      {
        name: 'Admin Vendor',
      },
      {
        name: 'Employee',
      },
      {
        name: 'Member',
      },
    ],
  });
}
