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
import { HomeContentSeed } from './home-content-seed';

const prisma = new PrismaClient();

async function runSeed(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`[seed] ${name}: OK`);
  } catch (err: any) {
    console.error(`[seed] ${name}: SKIPPED (${err?.message ?? 'unknown error'})`);
  }
}

async function main() {
  // Setiap seed dibungkus try/catch supaya 1 gagal tidak hentikan seed lain
  await runSeed('MembersSeed', MembersSeed);
  await runSeed('HomeContentSeed', HomeContentSeed);
  // await runSeed('RolesSeed', RolesSeed);
  // await runSeed('MenusSeed', MenusSeed);
  // await runSeed('PermissionSeed', PermissionSeed);
  // await runSeed('CategorySeed', CategorySeed);
  // await runSeed('ItemsSeed', ItemsSeed);
  // await runSeed('UsersSeed', UsersSeed);
  // await runSeed('PositionSeed', PositionSeed);
  // await runSeed('StoreSeed', StoreSeed);
  // await runSeed('BrandsSeed', BrandsSeed);
  // await runSeed('ServiceTypeSeed', ServiceTypeSeed);
  // await runSeed('StatusSeed', StatusSeed);
  // await runSeed('BankSeed', BankSeed);
  // await runSeed('CitySeed', CitySeed);
  // await runSeed('UnitSeed', UnitSeed);
  // await runSeed('ComplaintChannelSeed', ComplaintChannelSeed);
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
