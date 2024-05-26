import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function BankSeed() {
  const bank = ['BCA', 'BJB', 'MEGA', 'MANDIRI', 'BRI', 'JAGO'];

  // const store: Prisma.storeCreateManyInput[] = permission_name.map((item) => {
  //   return {
  //     store_name: item,
  //     address: item,
  //     city_id: 1,
  //     zip_code: '00000',
  //   };
  // });

  await prisma.bank.createMany({
    data: bank.map((x) => ({
      bank_name: x,
    })),
  });
}
