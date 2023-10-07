import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export async function ItemsSeed() {
  await prisma.items.createMany({
    data: [
      {
        item_name: 'Laptop',
        category_name: 'Electronic'
      },
      {
        item_name: 'Keyboard',
        category_name: 'Electronic'
      },
      {
        item_name: 'AC',
        category_name: 'Electronic'
      },
      {
        item_name: 'PC',
        category_name: 'Electronic'
      },
      {
        item_name: 'Kulkas',
        category_name: 'Electronic'
      },
      {
        item_name: 'Pipa',
        category_name: 'Matrial'
      },
      {
        item_name: 'Selang Pipa',
        category_name: 'Matrial'
      },
      {
        item_name: 'Obeng',
        category_name: 'Perkakas'
      },
      {
        item_name: 'Baut',
        category_name: 'Matrial'
      },
      {
        item_name: 'Tang',
        category_name: 'Perkakas'
      }
    ],
  });
}
