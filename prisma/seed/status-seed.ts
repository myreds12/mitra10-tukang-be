import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function StatusSeed() {
  const status = [
    { category: 'BOOK', description: 'Book' },
    { category: 'BOOKED', description: 'Booked' },
    { category: 'INVESTIGATE', description: 'Investigate' },
    { category: 'INVESTIGATED', description: 'Investigated' },
    { category: 'SURVEYREQ', description: 'Survey Request' },
    { category: 'SURVEYSTART', description: 'Survey Start' },
    { category: 'SURVEYDONE', description: 'Survey Done' },
    { category: 'QUOTEIN', description: 'Quotation In' },
    { category: 'QOUTEOUT', description: 'Quotation Out' },
    { category: 'WORKREQ', description: 'Work Order Request' },
    { category: 'WORKSTART', description: 'Work Order Start' },
    { category: 'WIP', description: 'Work In Progress' },
    { category: 'WORKEND', description: 'Work Order End' },
    { category: 'INVOICEDRAFT', description: 'Invoice Draft' },
    { category: 'INVOICE', description: 'Invoice' },
    { category: 'INVOICESEND', description: 'Invoice Send' },
    { category: 'CSIOUT', description: 'CSI Out' },
    { category: 'REFUND', description: 'Refund' },
    { category: 'ACCEPTED', description: 'Accepted' },
    { category: 'APPROVE', description: 'Approve' },
    { category: 'REJECT', description: 'Reject' },
    { category: 'RESCHEDULE', description: 'Reschedule' },
    { category: 'REWORK', description: 'Rework' },
    { category: 'REWORKEND', description: 'Rework End' },
    { category: 'WARRANTYCLAIM', description: 'Warranty Claim' },
    { category: 'WARRANTYCLAIM', description: 'Warranty Claim' },
  ];

  // const store: Prisma.storeCreateManyInput[] = permission_name.map((item) => {
  //   return {
  //     store_name: item,
  //     address: item,
  //     city_id: 1,
  //     zip_code: '00000',
  //   };
  // });

  await prisma.status.createMany({
    data: status,
  });
}
