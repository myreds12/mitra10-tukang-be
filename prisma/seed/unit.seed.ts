import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function UnitSeed() {
  const unit = [
    { unit_name: 'Unit1' },
    { unit_name: 'Unit2' },
    { unit_name: 'Unit3' },
    { unit_name: 'Unit4' },
    { unit_name: 'Unit5' },
    { unit_name: 'Unit6' },
  ];

  // const store: Prisma.storeCreateManyInput[] = permission_name.map((item) => {
  //   return {
  //     store_name: item,
  //     address: item,
  //     city_id: 1,
  //     zip_code: '00000',
  //   };
  // });

  await prisma.units.createMany({
    data: unit,
  });
}
