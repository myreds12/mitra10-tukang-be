import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function BankSeed() {
  const bank = [
    { bank_name: 'BCA' },
    { bank_name: 'BJB' },
    { bank_name: 'MEGA' },
    { bank_name: 'MANDIRI' },
    { bank_name: 'BRI' },
    { bank_name: 'JAGO' },
  ];

  // const store: Prisma.storeCreateManyInput[] = permission_name.map((item) => {
  //   return {
  //     store_name: item,
  //     address: item,
  //     city_id: 1,
  //     zip_code: '00000',
  //   };
  // });

  await prisma.bank.createMany({
    data: bank,
  });
}
