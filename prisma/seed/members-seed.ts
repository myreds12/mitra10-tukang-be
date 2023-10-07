import { Prisma, PrismaClient } from '@prisma/client';
import { hash } from 'bcrypt';

const prisma = new PrismaClient();
export async function MembersSeed() {
  const members: Array<Prisma.membersCreateManyInput> = [
    ...Array(10).keys(),
  ].map((x) => ({
    address_1: 'Bogor',
    email: `member${x}@example.com`,
    full_name: `Member Example ${x}`,
    join_location: 1,
    phone_number: '',
    whatsapp_number: '',
  }));

  await prisma.members.createMany({
    data: members,
  });
}
