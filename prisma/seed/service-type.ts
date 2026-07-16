import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export async function ServiceTypeSeed() {
  await prisma.service_type.createMany({
    data: [
      {
        service_type: 'Civil (service by unit)'
      },
      {
        service_type: 'Electrical (service by unit)'
      },
      {
        service_type: 'Renovasi (service by project)'
      },
    ],
  });
}
