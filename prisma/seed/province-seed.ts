import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export async function RolesSeed() {
  await prisma.province.createMany({
    data: [
      {
        province_name: 'JAWA BARAT',
      },
      {
        province_name: 'JAWA TIMUR',
      },
      {
        province_name: 'JAWA TENGAH',
      },
      {
        province_name: 'JAKARTA',
      },
    ],
  });
}
