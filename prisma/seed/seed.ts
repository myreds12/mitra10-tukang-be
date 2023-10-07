import { PrismaClient } from '@prisma/client';
import { MenusSeed } from './menu-seed';
import { RolesSeed } from './roles-seed';
import { ItemsSeed } from './items-seed';
import { UsersSeed } from './users-seed';
import { PermissionSeed } from './permission-seed';
import { MembersSeed } from './members-seed';

const prisma = new PrismaClient();

async function main() {
  await RolesSeed();
  await MenusSeed();
  await ItemsSeed();
  await UsersSeed();
  await PermissionSeed();
  await MembersSeed();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
