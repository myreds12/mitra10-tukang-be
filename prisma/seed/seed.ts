import { PrismaClient } from '@prisma/client';
import { MenusSeed } from './menu-seed';
import { RolesSeed } from './roles-seed';
import { ItemsSeed } from './items-seed';
import { UsersSeed } from './users-seed';
import { PermissionSeed } from './permission-seed';
import { MembersSeed } from './members-seed';
import { PositionSeed } from './position-seed';
import { StoreSeed } from './store-seed';
import { ServiceTypeSeed } from './service-type';
import { StatusSeed } from './status-seed';
import { BankSeed } from './bank-seed';
import { CitySeed } from './city-seed';
import { UnitSeed } from './unit.seed';
import { ComplaintChannelSeed } from './complaint-channels.seed';
import { CategorySeed } from './categories-seed';
import { BrandsSeed } from './brands-seed';

const prisma = new PrismaClient();

async function main() {
  // await RolesSeed();
  // await MenusSeed();
  // await PermissionSeed();
  // await CategorySeed();
  // await ItemsSeed();
  // await UsersSeed();
  await MembersSeed();
  // await PositionSeed();
  // await StoreSeed();
  // await BrandsSeed();
  // await ServiceTypeSeed();
  // await StatusSeed();
  // await BankSeed();
  // await CitySeed();
  // await UnitSeed();
  // await ComplaintChannelSeed();
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
