import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function StoreSeed() {
  const city = await prisma.city.findMany();
  const store = [
    { store_name: 'mitra10_Tarakan', address: 'Tarakan' },
    { store_name: 'mitra10_Bima', address: 'Bima' },
    { store_name: 'mitra10_Pematang', address: 'Pematang' },
    { store_name: 'mitra10_Bengkulu', address: 'Bengkulu' },
    { store_name: 'mitra10_Lhokseumawe', address: 'Lhokseumawe' },
    { store_name: 'mitra10_Batu', address: 'Batu' },
    { store_name: 'mitra10_Bukittinggi', address: 'Bukittinggi' },
    { store_name: 'mitra10_Bandung', address: 'Bandung' },
    { store_name: 'mitra10_Banda', address: 'Banda' },
    { store_name: 'mitra10_Yogyakarta', address: 'Yogyakarta' },
    { store_name: 'mitra10_Palopo', address: 'Palopo' },
    { store_name: 'mitra10_Kupang', address: 'Kupang' },
    { store_name: 'mitra10_Makassar', address: 'Makassar' },
    { store_name: 'mitra10_Yogyakarta', address: 'Yogyakarta' },
    { store_name: 'mitra10_Solok', address: 'Solok' },
  ];

  const storeQuery: Prisma.storeCreateManyInput[] = store.map((item) => {
    return {
      store_name: item.store_name,
      address: item.address,
      city_id: city.find((x) =>
        x.city_name.toLowerCase().includes(item.address.toLowerCase()),
      )?.id ?? 1,
      zip_code: '00000',
    };
  });

  console.log(storeQuery);
  

  await prisma.store.createMany({
    data: storeQuery,
  });
}
