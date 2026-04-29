import { PrismaClient } from '@prisma/client';
import * as _ from 'lodash';
const prisma = new PrismaClient();
export async function MenusSeed() {
  const menu = [
    'Items',
    'Orders',
    'Tukang',
    'Vendor',
    'Complaints',
    'Employee',
    'Invoices',
    'CSI',
    'Work Order',
    'Member',
    'Quotation',
    'Remedials',
    'Store',
    'Auth',
    'Sales',
    'Reports',
  ];

  const menuData = menu.map((x) => ({
    icon: _.startCase(x),
    url: x.toLocaleLowerCase(),
    title: _.startCase(x),
  }));

  await prisma.menus.createMany({
    data: menuData,
  });
}
