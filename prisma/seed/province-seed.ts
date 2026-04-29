import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export async function RolesSeed() {
  // Indonesian provinces array here
  const provinces = [
    'Aceh',
    'Bali',
    'Banten',
    'Bengkulu',
    'Gorontalo',
    'Jakarta',
    'Jambi',
    'Jawa Barat',
    'Jawa Tengah',
    'Jawa Timur',
    'Kalimantan Barat',
    'Kalimantan Selatan',
    'Kalimantan Tengah',
    'Kalimantan Timur',
    'Kalimantan Utara',
    'Kepulauan Bangka Belitung',
    'Kepulauan Riau',
    'Lampung',
    'Maluku',
    'Maluku Utara',
    'Nusa Tenggara Barat',
    'Nusa Tenggara Timur',
    'Papua',
    'Papua Barat',
    'Riau',
    'Sulawesi Barat',
    'Sulawesi Selatan',
    'Sulawesi Tengah',
    'Sulawesi Tenggara',
    'Sulawesi Utara',
    'Sumatera Barat',
    'Sumatera Selatan',
    'Sumatera Utara',
    'Yogyakarta',
  ];

  const data = provinces.map((province) => ({ province_name: province }));

  await prisma.province.createMany({ data });
  // await prisma.province.createMany({
  //   data: [{
  //     c
  //   }]
  // });
}
