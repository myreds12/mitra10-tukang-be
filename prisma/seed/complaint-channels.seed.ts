import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function ComplaintChannelSeed() {
  const complaint_channel = [
    { name: 'WhatsApp' },
    { name: 'Telpon' },
    { name: 'Kasir' },
    { name: 'Email' },
    { name: 'Surat' },
    { name: 'Tukang' },
  ];

  // const store: Prisma.storeCreateManyInput[] = permission_name.map((item) => {
  //   return {
  //     store_name: item,
  //     address: item,
  //     city_id: 1,
  //     zip_code: '00000',
  //   };
  // });

  await prisma.complaint_channels.createMany({
    data: complaint_channel,
  });
}
