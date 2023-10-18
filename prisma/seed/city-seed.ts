import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export async function RolesSeed() {
  await prisma.city.createMany({
    data: [
      {
        city_name: 'BOGOR',
      },
      {
        city_name: 'JAKARTA',
      },
      {
        city_name: 'BANDUNG',
      },
      {
        city_name: 'SURABAYA',
      },
      {
        city_name: 'JOGJAKARTA',
      },
      {
        city_name: 'SOLO',
      },
    ],
  });
}
