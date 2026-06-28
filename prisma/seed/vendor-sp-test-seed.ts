/* eslint-disable prettier/prettier */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TEST_PREFIX = 'SP_TEST_';
const CLEAR_SCOPE = process.env.CLEAR_VENDOR_SCOPE || 'test';
const SEED_PASSWORD = process.env.SEED_VENDOR_PASSWORD || 'password123';

const violationTypes = [
  ['ORDER_NOT_CONFIRMED_H', 'KONFIRMASI_ORDER', 'Orderan tidak terkonfirmasi pada Hari H'],
  ['ORDER_NOT_CONFIRMED_H1', 'KONFIRMASI_ORDER', 'Orderan tidak terkonfirmasi pada H+1'],
  ['ORDER_NOT_CONFIRMED_H_PLUS', 'KONFIRMASI_ORDER', 'Orderan tidak terkonfirmasi pada >H+1'],
  ['RESCHEDULE_NOT_UPDATED', 'RESCHEDULE', 'Tidak update status order sejak tanggal reschedule diajukan'],
  ['RESCHEDULE_CHANGE_SCHEDULE', 'RESCHEDULE', 'Mengubah jadwal survey/pengerjaan saat hari pelaksanaan'],
  ['REFUND_5_PER_QUARTER', 'REFUND', '5 order refund per quarter'],
  ['REFUND_6_10_PER_QUARTER', 'REFUND', '6-10 order refund per quarter'],
  ['CUSTOMER_COMPLAINT', 'LAINNYA', 'Customer komplain terkait jadwal atau pengerjaan'],
  ['QUOTATION_NOT_FULFILLED', 'LAINNYA', 'Tidak memenuhi pelaksanaan pekerjaan atas quotation'],
  ['QUOTATION_LATE_H2', 'LAINNYA', 'Quotation terbit > H+2 sejak Survey Selesai'],
  ['QUOTATION_LATE_H3', 'LAINNYA', 'Quotation terbit > H+3 sejak Survey Selesai'],
  ['DOC_NOT_UPLOADED', 'LAINNYA', 'Tidak upload dokumentasi foto before/after'],
  ['STATUS_NOT_UPDATED_H', 'LAINNYA', 'Tidak update status order pada hari H'],
  ['STATUS_NOT_UPDATED_H1', 'LAINNYA', 'Tidak update status order pada H+1'],
  ['STATUS_NOT_UPDATED_H_PLUS', 'LAINNYA', 'Tidak update status order pada >H+2'],
] as const;

async function main() {
  console.log(`Starting vendor SP seed. Clear scope: ${CLEAR_SCOPE}`);

  await clearVendorData();
  const refs = await ensureMasterData();

  await seedVendorWithPoints({
    refs,
    code: 'NORMAL',
    companyName: `${TEST_PREFIX}Vendor Normal`,
    pointCount: 0,
    expectedSpLevel: null,
    isActive: true,
  });

  await seedVendorWithPoints({
    refs,
    code: 'SP1',
    companyName: `${TEST_PREFIX}Vendor SP1`,
    pointCount: 5,
    expectedSpLevel: 1,
    isActive: true,
  });

  await seedVendorWithPoints({
    refs,
    code: 'SP2',
    companyName: `${TEST_PREFIX}Vendor SP2`,
    pointCount: 30,
    expectedSpLevel: 2,
    isActive: true,
  });

  await seedVendorWithPoints({
    refs,
    code: 'SP3',
    companyName: `${TEST_PREFIX}Vendor SP3`,
    pointCount: 51,
    expectedSpLevel: 3,
    isActive: false,
  });

  await seedVendorWithPoints({
    refs,
    code: 'RESET',
    companyName: `${TEST_PREFIX}Vendor Reset Approved`,
    pointCount: 3,
    expectedSpLevel: 1,
    isActive: true,
    resetApproved: true,
  });

  console.log('Vendor SP seed completed.');
  console.log(`Login sample owner vendor: ${TEST_PREFIX.toLowerCase()}sp1_owner / ${SEED_PASSWORD}`);
  console.log(`Login sample super user: ${TEST_PREFIX.toLowerCase()}super_user / ${SEED_PASSWORD}`);
  console.log(`Login sample admin HO: ${TEST_PREFIX.toLowerCase()}admin_ho / ${SEED_PASSWORD}`);
}

async function clearVendorData() {
  const vendorWhere =
    CLEAR_SCOPE === 'all'
      ? { deleted_at: null }
      : { company_name: { startsWith: TEST_PREFIX } };

  const vendors = await prisma.vendor.findMany({
    where: vendorWhere,
    select: { id: true },
  });
  const vendorIds = vendors.map((vendor) => vendor.id);

  if (!vendorIds.length) {
    console.log('No vendor data to clear.');
    await clearSeedUsers();
    return;
  }

  console.log(`Clearing ${vendorIds.length} vendor(s).`);

  const tukangIds = (
    await prisma.tukang.findMany({
      where: { vendor_id: { in: vendorIds } },
      select: { id: true },
    })
  ).map((tukang) => tukang.id);

  await prisma.$transaction(async (tx) => {
    await tx.vendor_violation_revision_request.deleteMany({
      where: { vendor_id: { in: vendorIds } },
    });

    const violationLogIds = (
      await tx.vendor_violation_log.findMany({
        where: { vendor_id: { in: vendorIds } },
        select: { id: true },
      })
    ).map((log) => log.id);

    const spIds = (
      await tx.vendor_sp.findMany({
        where: { vendor_id: { in: vendorIds } },
        select: { id: true },
      })
    ).map((sp) => sp.id);

    if (spIds.length) {
      await tx.vendor_sp_detail.deleteMany({
        where: { vendor_sp_id: { in: spIds } },
      });
    }

    if (violationLogIds.length) {
      await tx.vendor_sp_detail.deleteMany({
        where: { violation_log_id: { in: violationLogIds } },
      });
    }

    await tx.vendor_sp.deleteMany({ where: { vendor_id: { in: vendorIds } } });
    await tx.vendor_reactivation_log.deleteMany({ where: { vendor_id: { in: vendorIds } } });
    await tx.vendor_violation_log.deleteMany({ where: { vendor_id: { in: vendorIds } } });

    const invoiceIds = (
      await tx.invoices.findMany({
        where: { vendor_id: { in: vendorIds } },
        select: { id: true },
      })
    ).map((invoice) => invoice.id);

    if (invoiceIds.length) {
      await tx.invoice_evidence.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      await tx.invoice_details.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      await tx.invoice_logs.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      await tx.invoices.deleteMany({ where: { id: { in: invoiceIds } } });
    }

    const workOrderIds = (
      await tx.work_orders.findMany({
        where: { vendor_id: { in: vendorIds } },
        select: { id: true },
      })
    ).map((workOrder) => workOrder.id);

    if (workOrderIds.length) {
      const requestTukangIds = (
        await tx.request_tukang.findMany({
          where: { work_order_id: { in: workOrderIds } },
          select: { id: true },
        })
      ).map((request) => request.id);

      if (requestTukangIds.length) {
        await tx.request_tukang_evidence.deleteMany({
          where: { request_tukang_id: { in: requestTukangIds } },
        });
      }

      const workOrderStatusIds = (
        await tx.work_order_status.findMany({
          where: { work_order_id: { in: workOrderIds } },
          select: { id: true },
        })
      ).map((status) => status.id);

      if (workOrderStatusIds.length) {
        const workOrderItemIds = (
          await tx.work_order_items.findMany({
            where: { work_order_status_id: { in: workOrderStatusIds } },
            select: { id: true },
          })
        ).map((item) => item.id);

        if (workOrderItemIds.length) {
          await tx.quotation_details.updateMany({
            where: { work_order_items_id: { in: workOrderItemIds } },
            data: { work_order_items_id: null },
          });
        }

        await tx.work_order_items.deleteMany({
          where: { work_order_status_id: { in: workOrderStatusIds } },
        });
      }

      await tx.request_tukang.deleteMany({ where: { work_order_id: { in: workOrderIds } } });
      await tx.work_order_tukang.deleteMany({ where: { work_order_id: { in: workOrderIds } } });
      await tx.work_order_evidences.deleteMany({ where: { work_order_id: { in: workOrderIds } } });
      await tx.work_order_status.deleteMany({ where: { work_order_id: { in: workOrderIds } } });
      await tx.work_orders.deleteMany({ where: { id: { in: workOrderIds } } });
    }

    if (tukangIds.length) {
      await tx.tukang_service.deleteMany({ where: { tukang_id: { in: tukangIds } } });
      await tx.tukang_area.deleteMany({ where: { tukang_id: { in: tukangIds } } });
      await tx.tukang_document.deleteMany({ where: { tukang_id: { in: tukangIds } } });
    }

    await tx.pic_vendor.deleteMany({ where: { vendor_id: { in: vendorIds } } });
    await tx.vendor_service.deleteMany({ where: { vendor_id: { in: vendorIds } } });
    await tx.vendor_area.deleteMany({ where: { vendor_id: { in: vendorIds } } });
    await tx.vendor_store.deleteMany({ where: { vendor_id: { in: vendorIds } } });
    await tx.vendor_document.deleteMany({ where: { vendor_id: { in: vendorIds } } });
    await tx.tukang.deleteMany({ where: { vendor_id: { in: vendorIds } } });

    await tx.orders.updateMany({
      where: { vendor_id: { in: vendorIds } },
      data: { vendor_id: null },
    });

    await tx.vendor.deleteMany({ where: { id: { in: vendorIds } } });
  });

  await clearSeedUsers();
}

async function clearSeedUsers() {
  await prisma.users.deleteMany({
    where: {
      username: {
        startsWith: TEST_PREFIX.toLowerCase(),
      },
    },
  });
}

async function ensureMasterData() {
  const password = await bcrypt.hash(SEED_PASSWORD, 10);

  const superUserRole = await ensureRole('Super User');
  const adminHoRole = await ensureRole('Admin HO');
  const ownerVendorRole = await ensureRole('Owner Vendor');
  const tukangRole = await ensureRole('Tukang');

  const superUser = await prisma.users.create({
    data: {
      username: `${TEST_PREFIX.toLowerCase()}super_user`,
      password,
      role_id: superUserRole.id,
    },
  });
  const adminHo = await prisma.users.create({
    data: {
      username: `${TEST_PREFIX.toLowerCase()}admin_ho`,
      password,
      role_id: adminHoRole.id,
    },
  });

  const bank =
    (await prisma.bank.findFirst({ where: { bank_name: 'Bank BCA', deleted_at: null } })) ||
    (await prisma.bank.create({ data: { bank_name: 'Bank BCA' } }));

  const area =
    (await prisma.area.findFirst({ where: { area: 'SP Test Area', deleted_at: null } })) ||
    (await prisma.area.create({ data: { area: 'SP Test Area' } }));

  const serviceType =
    (await prisma.service_type.findFirst({ where: { service_type: 'SP Test Service', deleted_at: null } })) ||
    (await prisma.service_type.create({ data: { service_type: 'SP Test Service', is_test: true } }));

  if (!serviceType.is_test) {
    await prisma.service_type.update({
      where: { id: serviceType.id },
      data: { is_test: true },
    });
  }

  const storeGroup =
    (await prisma.store_group.findFirst({ where: { group_name: 'SP Test Store Group', deleted_at: null } })) ||
    (await prisma.store_group.create({ data: { group_name: 'SP Test Store Group' } }));

  const store =
    (await prisma.store.findFirst({ where: { store_name: 'SP Test Store', deleted_at: null } })) ||
    (await prisma.store.create({
      data: {
        area_id: area.id,
        store_group_id: storeGroup.id,
        store_name: 'SP Test Store',
        email: 'sp.test.store@example.com',
        address: 'Jl. Seed Vendor SP No. 1',
      },
    }));

  await ensureViolationTypes();

  return {
    password,
    superUser,
    adminHo,
    ownerVendorRole,
    tukangRole,
    bank,
    area,
    serviceType,
    store,
  };
}

async function ensureRole(name: string) {
  return (
    (await prisma.roles.findFirst({ where: { name, deleted_at: null } })) ||
    (await prisma.roles.create({ data: { name } }))
  );
}

async function ensureViolationTypes() {
  for (const [code, category, name] of violationTypes) {
    const existing = await prisma.vendor_violation_type.findFirst({
      where: { code, deleted_at: null },
    });

    if (existing) {
      await prisma.vendor_violation_type.update({
        where: { id: existing.id },
        data: {
          category,
          name,
          description: name,
          point: 1,
          is_active: true,
          updated_at: new Date(),
        },
      });
      continue;
    }

    await prisma.vendor_violation_type.create({
      data: {
        code,
        category,
        name,
        description: name,
        point: 1,
        is_active: true,
      },
    });
  }
}

async function seedVendorWithPoints(params: {
  refs: Awaited<ReturnType<typeof ensureMasterData>>;
  code: string;
  companyName: string;
  pointCount: number;
  expectedSpLevel: number | null;
  isActive: boolean;
  resetApproved?: boolean;
}) {
  const { refs, code, companyName, pointCount, expectedSpLevel, isActive, resetApproved } = params;
  const usernameBase = `${TEST_PREFIX.toLowerCase()}${code.toLowerCase()}`;
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const year = now.getFullYear();

  const ownerUser = await prisma.users.create({
    data: {
      username: `${usernameBase}_owner`,
      password: refs.password,
      role_id: refs.ownerVendorRole.id,
    },
  });

  const tukangUser = await prisma.users.create({
    data: {
      username: `${usernameBase}_tukang`,
      password: refs.password,
      role_id: refs.tukangRole.id,
    },
  });

  const vendor = await prisma.vendor.create({
    data: {
      bank_id: refs.bank.id,
      company_name: companyName,
      pic_name: `${code} PIC`,
      address: `Jl. Vendor Seed ${code}`,
      phone_number: `08120000${code.length}${pointCount.toString().padStart(2, '0')}`,
      email_address: `${usernameBase}@example.com`,
      account_name: `${companyName} Account`,
      account_number: `8800${pointCount.toString().padStart(4, '0')}`,
      margin_type: 1,
      margin_nominal: 10,
      nominal_survey: 50000,
      is_active: isActive,
      max_order: 10,
      created_by: refs.adminHo.id,
    },
  });

  await prisma.pic_vendor.create({
    data: {
      vendor_id: vendor.id,
      user_id: ownerUser.id,
      pic_name: `${code} PIC`,
      email_address: `${usernameBase}@example.com`,
    },
  });

  await prisma.vendor_area.create({
    data: {
      vendor_id: vendor.id,
      area_id: refs.area.id,
      default_discount: 0,
      default_unit: 'unit',
    },
  });

  await prisma.vendor_service.create({
    data: {
      vendor_id: vendor.id,
      service_type_id: refs.serviceType.id,
    },
  });

  await prisma.vendor_store.create({
    data: {
      vendor_id: vendor.id,
      store_id: refs.store.id,
    },
  });

  const tukang = await prisma.tukang.create({
    data: {
      vendor_id: vendor.id,
      user_id: tukangUser.id,
      full_name: `${code} Tukang`,
      address: `Jl. Tukang Seed ${code}`,
      phone_number: `08210000${code.length}${pointCount.toString().padStart(2, '0')}`,
      ktp_number: `31740000${pointCount.toString().padStart(4, '0')}`,
      email: `${usernameBase}.tukang@example.com`,
      bod: new Date('1990-01-01'),
      is_active: true,
      created_by: refs.adminHo.id,
    },
  });

  await prisma.tukang_service.create({
    data: {
      tukang_id: tukang.id,
      service_type_id: refs.serviceType.id,
    },
  });

  await prisma.tukang_area.create({
    data: {
      tukang_id: tukang.id,
      area_id: refs.area.id,
    },
  });

  const logs = await seedViolationLogs(vendor.id, pointCount, quarter, year, refs.adminHo.id, resetApproved);

  if (expectedSpLevel) {
    const totalPoint = resetApproved ? 0 : pointCount;
    const sp = await prisma.vendor_sp.create({
      data: {
        vendor_id: vendor.id,
        sp_level: expectedSpLevel,
        total_point: totalPoint,
        quarter,
        year,
        start_date: now,
        end_date: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
        status: resetApproved ? 2 : 1,
        allocation_reduction: resetApproved ? null : getAllocationReduction(expectedSpLevel),
        notes: resetApproved
          ? 'Seed SP history retained after approved point reset.'
          : `Seed SP${expectedSpLevel} with ${pointCount} point(s).`,
        created_by: refs.adminHo.id,
      },
    });

    if (logs.length) {
      await prisma.vendor_sp_detail.createMany({
        data: logs.slice(0, 20).map((log) => ({
          vendor_sp_id: sp.id,
          violation_log_id: log.id,
          created_by: refs.adminHo.id,
        })),
      });
    }
  }

  if (resetApproved && logs.length) {
    await prisma.vendor_violation_revision_request.create({
      data: {
        vendor_id: vendor.id,
        requested_by: refs.adminHo.id,
        type: 'RESET',
        reason: 'Seed approved reset for testing has_ever_sp and adjusted points.',
        status: 'APPROVED',
        reviewed_by: refs.superUser.id,
        review_note: 'Approved by seed.',
        reviewed_at: now,
      },
    });
  }

  console.log(`${companyName}: vendor_id=${vendor.id}, points=${resetApproved ? 0 : pointCount}, SP=${expectedSpLevel || 'NORMAL'}`);
}

async function seedViolationLogs(
  vendorId: number,
  count: number,
  quarter: number,
  year: number,
  userId: number,
  resetApproved?: boolean,
) {
  if (count <= 0) return [];

  const types = await prisma.vendor_violation_type.findMany({
    where: { deleted_at: null, is_active: true },
    orderBy: { id: 'asc' },
  });

  if (!types.length) {
    throw new Error('vendor_violation_type is empty. Cannot seed SP points.');
  }

  const logs = [];
  for (let i = 0; i < count; i += 1) {
    const type = types[i % types.length];
    logs.push(
      await prisma.vendor_violation_log.create({
        data: {
          vendor_id: vendorId,
          violation_type_id: type.id,
          quarter,
          year,
          description: `Seed violation ${i + 1}/${count}: ${type.code}`,
          adjusted_point: resetApproved ? 0 : null,
          revision_note: resetApproved ? 'Reset by approved seed request.' : null,
          revised_at: resetApproved ? new Date() : null,
          revised_by: resetApproved ? userId : null,
          is_active: true,
          created_by: userId,
        },
      }),
    );
  }

  return logs;
}

function getAllocationReduction(spLevel: number) {
  if (spLevel === 1) return 50;
  if (spLevel === 2) return 75;
  return 100;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
