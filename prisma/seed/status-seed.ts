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

    { category: 'RESURVEYREQ', description: 'Resurvey Request' },
    { category: 'RESURVEYSTART', description: 'Resurvey Start' },
    { category: 'RESURVEYDONE', description: 'Resurvey Done' },

    { category: 'QUOTEIN', description: 'Quotation In' },
    { category: 'QUOTEOUT', description: 'Quotation Out' },

    { category: 'WORKREQ', description: 'Work Order Request' },
    { category: 'WORKSTART', description: 'Work Order Start' },
    { category: 'WIP', description: 'Work In Progress' },
    { category: 'WORKEND', description: 'Work Order End' },

    { category: 'REWORKREQ', description: 'Rework Request' },
    { category: 'REWORKSTART', description: 'Rework Start' },
    { category: 'REWORKEND', description: 'Rework End' },

    { category: 'INVOICEDRAFT', description: 'Invoice Draft' },
    { category: 'INVOICE', description: 'Invoice' },
    { category: 'INVOICESEND', description: 'Invoice Send' },

    { category: 'CSIIN', description: 'CSI In' },
    { category: 'CSIOUT', description: 'CSI Out' },

    { category: 'REFUND', description: 'Refund' },
    { category: 'REFUNDED', description: 'Refunded' },

    { category: 'ACCEPTED', description: 'Accepted' },
    { category: 'APPROVE', description: 'Approve' },
    { category: 'REJECTED', description: 'Rejected' },

    { category: 'RESCHEDULE', description: 'Reschedule' },

    { category: 'WARRANTYCLAIM', description: 'Warranty Claim' },

    { category: 'PAID', description: 'Paid' },
    { category: 'UNPAID', description: 'Unpaid' },

    { category: 'FEEDBACK', description: 'Feedback' },
    { category: 'NONE', description: 'None' },
    { category: 'PENDING', description: 'Pending' },
  ];

  await prisma.status.createMany({
    data: status,
  });
}
