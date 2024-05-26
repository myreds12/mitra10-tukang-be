import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function BrandsSeed() {
  const bank = [
    'Samsung',
    'LG',
    'Bosch',
    'Panasonic',
    'Sharp',
    'TOTO',
    'Toshiba',
    'Sony',
    'Hitachi',
    'Mitsubishi',
    'Haier',
    'Lenovo',
    'Xiaomi',
    'Huawei',
    'ASUS',
    'Honda',
    'Toyota',
    'Fujitsu',
    'Canon',
    'Nikon',
    'Subaru',
    'Daikin',
  ];

  await prisma.brands.createMany({
    data: bank.map((x) => ({
      name: x,
    })),
  });
}
