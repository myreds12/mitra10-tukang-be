import { PrismaClient } from '@prisma/client';
import { hash } from 'bcrypt';

const prisma = new PrismaClient();
export async function UsersSeed() {
  const roles = await prisma.roles.findMany()
  await prisma.users.createMany({
    data: [
      {
        username: 'storeCS',
        password :  await hash('password', 12),
        role_id: roles.find(x => x.name.toLowerCase().includes('store cs')).id
      },
      {
        username: 'storeStaff',
        password :  await hash('password', 12),
        role_id: roles.find(x => x.name.toLowerCase().includes('store staff')).id
      },
      {
        username: 'adminHo',
        password :  await hash('password', 12),
        role_id: roles.find(x => x.name.toLowerCase().includes('admin ho')).id
      },
      {
        username: 'adminVendor',
        password :  await hash('password', 12),
        role_id: roles.find(x => x.name.toLowerCase().includes('admin vendor')).id
      },
      {
        username: 'tukang1',
        password :  await hash('password', 12),
        role_id: roles.find(x => x.name.toLowerCase().includes('tukang')).id
      },
      {
        username: 'tukang2',
        password :  await hash('password', 12),
        role_id: roles.find(x => x.name.toLowerCase().includes('tukang')).id
      },
      {
        username: 'tukang3',
        password :  await hash('password', 12),
        role_id: roles.find(x => x.name.toLowerCase().includes('tukang')).id
      },
      {
        username: 'tukang4',
        password :  await hash('password', 12),
        role_id: roles.find(x => x.name.toLowerCase().includes('tukang')).id
      },
    ],
  });
}
