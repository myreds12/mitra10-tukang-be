import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function StoreSeed() {
  const permission_name = [
    'Mitra 10 - Cibinong',
    'Mitra 10 - Cijeruk',
    'Mitra 10 - Cirebon',
    'Mitra 10 - Fatmawati',
    'Mitra 10 - Bogor',
  ];

  const store: Prisma.storeCreateManyInput[] = permission_name.map((item) => {
    return {
      store_name: item,
      address: item,
      city_id: 1,
      zip_code: '00000',
    };
  });

  await prisma.store.createMany({
    data: store,
  });
}
