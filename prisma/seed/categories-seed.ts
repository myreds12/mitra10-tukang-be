import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export async function CategorySeed() {
  const categories = [
    'APPLIANCES',
    'BATHROOM',
    'BUILDING MATERIAL',
    'DOORS AND WINDOWS',
    'ELECTRICAL AND LIGHTING',
    'FLOORING AND WALL',
    'HARDWARE',
    'HOUSEWARE & HOBBIES',
    'KITCHEN',
    'PAINT AND SUNDRIES',
    'PLUMBING',
    'TOOLS',
  ];

  await prisma.categories.createMany({
    data: categories.map((x) => ({
      category_name: x,
    })),
  });
}
