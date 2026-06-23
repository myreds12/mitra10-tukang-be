/* eslint-disable prettier/prettier */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PREFIX = 'SP_ORDER_RULE_';
const READY_PREFIX = `${PREFIX}READY_`;
const EVIDENCE_PREFIX = `${PREFIX}EVIDENCE_`;
const MODE = (process.env.SEED_SP_ORDER_MODE || 'all').toLowerCase();
const PASSWORD = process.env.SEED_VENDOR_PASSWORD || 'password123';
const SHOULD_CLEAR = process.env.CLEAR_SP_ORDER_RULE !== '0';
const ORDERS_PER_RULE = 5;

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

const ruleCodes = violationTypes.map(([code]) => code);

type Refs = Awaited<ReturnType<typeof ensureMasterData>>;
type ModeName = 'READY' | 'EVIDENCE';

function daysAgo(days: number) {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function currentQuarter() {
  const now = new Date();
  return {
    quarter: Math.ceil((now.getMonth() + 1) / 3),
    year: now.getFullYear(),
  };
}

async function main() {
  if (!['ready', 'evidence', 'all'].includes(MODE)) {
    throw new Error('SEED_SP_ORDER_MODE must be one of: ready, evidence, all');
  }

  console.log(`Starting Vendor SP order rules seed. mode=${MODE}, clear=${SHOULD_CLEAR}`);

  if (SHOULD_CLEAR) {
    await clearSeedData();
  }

  const refs = await ensureMasterData();
  const summaries: string[] = [];

  if (MODE === 'ready' || MODE === 'all') {
    summaries.push(...await seedMode(refs, 'READY'));
  }

  if (MODE === 'evidence' || MODE === 'all') {
    summaries.push(...await seedMode(refs, 'EVIDENCE'));
    summaries.push(...await seedThresholdEvidence(refs));
  }

  console.log('\n=== Vendor SP Order Rule Seed Summary ===');
  console.log(`Login Admin HO : ${PREFIX.toLowerCase()}admin_ho / ${PASSWORD}`);
  console.log(`Login Super User: ${PREFIX.toLowerCase()}super_user / ${PASSWORD}`);
  console.log('\nRule | Mode | Vendor ID | Order ID | Project Number | Action | Expected | Screenshot Route');
  console.log('--- | --- | --- | --- | --- | --- | --- | ---');
  summaries.forEach((line) => console.log(line));
  console.log('\nRecommended screenshots:');
  console.log('- Before/action: order/refund/reschedule/work-order page sesuai rule');
  console.log('- After log: /vendor-sp/violation-log');
  console.log('- SP result: /vendor-sp/view and /vendor-sp/detail/:id');
}

async function clearSeedData() {
  const orders = await prisma.orders.findMany({
    where: { project_number: { startsWith: PREFIX } },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);

  const vendors = await prisma.vendor.findMany({
    where: { company_name: { startsWith: PREFIX } },
    select: { id: true },
  });
  const vendorIds = vendors.map((vendor) => vendor.id);

  if (!orderIds.length && !vendorIds.length) {
    await clearSeedUsers();
    console.log('No SP_ORDER_RULE data to clear.');
    return;
  }

  console.log(`Clearing ${orderIds.length} order(s), ${vendorIds.length} vendor(s).`);

  await prisma.$transaction(async (tx) => {
    await tx.vendor_violation_revision_request.deleteMany({
      where: { vendor_id: { in: vendorIds } },
    });

    const violationLogIds = (
      await tx.vendor_violation_log.findMany({
        where: {
          OR: [
            { vendor_id: { in: vendorIds } },
            { order_id: { in: orderIds } },
          ],
        },
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
      await tx.vendor_sp_detail.deleteMany({ where: { vendor_sp_id: { in: spIds } } });
    }
    if (violationLogIds.length) {
      await tx.vendor_sp_detail.deleteMany({ where: { violation_log_id: { in: violationLogIds } } });
    }

    await tx.vendor_sp.deleteMany({ where: { vendor_id: { in: vendorIds } } });
    await tx.vendor_reactivation_log.deleteMany({ where: { vendor_id: { in: vendorIds } } });
    await tx.vendor_violation_log.deleteMany({
      where: {
        OR: [
          { vendor_id: { in: vendorIds } },
          { order_id: { in: orderIds } },
        ],
      },
    });

    const refundIds = (
      await tx.refund.findMany({
        where: { order_id: { in: orderIds } },
        select: { id: true },
      })
    ).map((refund) => refund.id);

    if (refundIds.length) {
      await tx.refund_evidences.deleteMany({ where: { refund_id: { in: refundIds } } });
      await tx.refund.deleteMany({ where: { id: { in: refundIds } } });
    }

    const rescheduleIds = (
      await tx.reschedule.findMany({
        where: { order_id: { in: orderIds } },
        select: { id: true },
      })
    ).map((reschedule) => reschedule.id);

    if (rescheduleIds.length) {
      await tx.reschedule_tukang.deleteMany({ where: { reschedule_id: { in: rescheduleIds } } });
      await tx.reschedule_evidences.deleteMany({ where: { reschedule_id: { in: rescheduleIds } } });
      await tx.reschedule_status.deleteMany({ where: { reschedule_id: { in: rescheduleIds } } });
      await tx.reschedule.deleteMany({ where: { id: { in: rescheduleIds } } });
    }

    const quotationIds = (
      await tx.quotation.findMany({
        where: { order_id: { in: orderIds } },
        select: { id: true },
      })
    ).map((quotation) => quotation.id);

    if (quotationIds.length) {
      await tx.quotation_follow_up.deleteMany({ where: { quotation_id: { in: quotationIds } } });
      await tx.quotation_receipt.deleteMany({ where: { quotation_id: { in: quotationIds } } });
      await tx.quotation_files.deleteMany({ where: { quotation_id: { in: quotationIds } } });
      await tx.quotation_details.deleteMany({ where: { quotation_id: { in: quotationIds } } });
      await tx.quotation_promotion.deleteMany({ where: { quotation_id: { in: quotationIds } } });
      await tx.quotation.deleteMany({ where: { id: { in: quotationIds } } });
    }

    const workOrderIds = (
      await tx.work_orders.findMany({
        where: {
          OR: [
            { order_id: { in: orderIds } },
            { vendor_id: { in: vendorIds } },
          ],
        },
        select: { id: true },
      })
    ).map((workOrder) => workOrder.id);

    if (workOrderIds.length) {
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

        await tx.work_order_items.deleteMany({ where: { work_order_status_id: { in: workOrderStatusIds } } });
      }

      await tx.request_tukang_evidence.deleteMany({
        where: {
          request_tukang: { work_order_id: { in: workOrderIds } },
        },
      });
      await tx.request_tukang.deleteMany({ where: { work_order_id: { in: workOrderIds } } });
      await tx.work_order_tukang.deleteMany({ where: { work_order_id: { in: workOrderIds } } });
      await tx.work_order_evidences.deleteMany({ where: { work_order_id: { in: workOrderIds } } });
      await tx.work_order_status.deleteMany({ where: { work_order_id: { in: workOrderIds } } });
      await tx.work_orders.deleteMany({ where: { id: { in: workOrderIds } } });
    }

    await tx.order_histories.deleteMany({ where: { order_id: { in: orderIds } } });
    await tx.order_files.deleteMany({ where: { order_id: { in: orderIds } } });
    await tx.m_order_details.deleteMany({ where: { order_id: { in: orderIds } } });
    await tx.orders.deleteMany({ where: { id: { in: orderIds } } });

    const tukangIds = (
      await tx.tukang.findMany({
        where: { vendor_id: { in: vendorIds } },
        select: { id: true },
      })
    ).map((tukang) => tukang.id);

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
    await tx.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    await tx.sales.deleteMany({ where: { full_name: { startsWith: PREFIX } } });
  });

  await clearSeedUsers();
}

async function clearSeedUsers() {
  await prisma.users.deleteMany({
    where: { username: { startsWith: PREFIX.toLowerCase() } },
  });
}

async function ensureMasterData() {
  const password = await bcrypt.hash(PASSWORD, 10);
  const superUserRole = await ensureRole('Super User');
  const adminHoRole = await ensureRole('Admin HO');
  const ownerVendorRole = await ensureRole('Owner Vendor');
  const tukangRole = await ensureRole('Tukang');
  const salesRole = await ensureRole('Sales');

  const superUser = await prisma.users.create({
    data: { username: `${PREFIX.toLowerCase()}super_user`, password, role_id: superUserRole.id },
  });
  const adminHo = await prisma.users.create({
    data: { username: `${PREFIX.toLowerCase()}admin_ho`, password, role_id: adminHoRole.id },
  });
  const salesUser = await prisma.users.create({
    data: { username: `${PREFIX.toLowerCase()}sales`, password, role_id: salesRole.id },
  });

  const bank =
    (await prisma.bank.findFirst({ where: { bank_name: `${PREFIX}Bank`, deleted_at: null } })) ||
    (await prisma.bank.create({ data: { bank_name: `${PREFIX}Bank` } }));

  const area =
    (await prisma.area.findFirst({ where: { area: `${PREFIX}Area`, deleted_at: null } })) ||
    (await prisma.area.create({ data: { area: `${PREFIX}Area` } }));

  const serviceType =
    (await prisma.service_type.findFirst({ where: { service_type: `${PREFIX}Service`, deleted_at: null } })) ||
    (await prisma.service_type.create({ data: { service_type: `${PREFIX}Service` } }));

  const storeGroup =
    (await prisma.store_group.findFirst({ where: { group_name: `${PREFIX}Store Group`, deleted_at: null } })) ||
    (await prisma.store_group.create({ data: { group_name: `${PREFIX}Store Group` } }));

  const store =
    (await prisma.store.findFirst({ where: { store_name: `${PREFIX}Store`, deleted_at: null } })) ||
    (await prisma.store.create({
      data: {
        area_id: area.id,
        store_group_id: storeGroup.id,
        store_name: `${PREFIX}Store`,
        email: 'sp.order.rule.store@example.com',
        address: 'Jl. Seed SP Order Rule',
      },
    }));

  const sales =
    (await prisma.sales.findFirst({ where: { full_name: `${PREFIX}Sales`, deleted_at: null } })) ||
    (await prisma.sales.create({
      data: {
        store_id: store.id,
        user_id: salesUser.id,
        full_name: `${PREFIX}Sales`,
        phone_number: '081299900001',
      },
    }));

  const member =
    (await prisma.members.findFirst({ where: { member_number: `${PREFIX}MEMBER`, deleted_at: null } })) ||
    (await prisma.members.create({
      data: {
        area_id: area.id,
        join_location: store.id,
        member_number: `${PREFIX}MEMBER`,
        full_name: `${PREFIX}Customer`,
        email: 'sp.order.rule.customer@example.com',
        phone_number: '081299900002',
        whatsapp_number: '081299900002',
        address_1: 'Jl. Customer Seed SP Order Rule',
        join_date: new Date(),
      },
    }));

  const statuses: Record<string, any> = {};
  for (const category of [
    'SURVEYREQ',
    'TUKANGSURVEY',
    'SURVEYDONE',
    'WORKREQ',
    'WORKSTART',
    'WORKDONE',
    'TUKANGWORK',
    'QUOTEIN',
    'QUOTEOUT',
    'QUOTATIONDRAFT',
    'QUOTATIONPAID',
    'RESCHEDULE',
    'RESCHEDULEAPPROVEDBYVENDOR',
    'RESCHEDULEAPPROVEDBYHO',
    'REFUNDREQ',
    'COMPLAINTREQ',
  ]) {
    statuses[category] = await ensureStatus(category);
  }

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
    sales,
    member,
    statuses,
  };
}

async function ensureRole(name: string) {
  return (
    (await prisma.roles.findFirst({ where: { name, deleted_at: null } })) ||
    (await prisma.roles.create({ data: { name } }))
  );
}

async function ensureStatus(category: string) {
  return (
    (await prisma.status.findFirst({ where: { category } })) ||
    (await prisma.status.create({
      data: {
        category,
        description: category,
        status_urgency: 0,
      },
    }))
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
        data: { category, name, description: name, point: 1, is_active: true },
      });
      continue;
    }

    await prisma.vendor_violation_type.create({
      data: { code, category, name, description: name, point: 1, is_active: true },
    });
  }
}

async function createVendor(refs: Refs, key: string, mode: ModeName) {
  const usernameBase = `${PREFIX.toLowerCase()}${mode.toLowerCase()}_${key.toLowerCase()}`;
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
      company_name: `${PREFIX}${mode}_VENDOR_${key}`.slice(0, 45),
      pic_name: `${mode} ${key} PIC`,
      address: `Jl. ${mode} ${key}`,
      phone_number: `0812${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      email_address: `${usernameBase}@example.com`,
      account_name: `${mode} ${key} Account`,
      account_number: `99${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      margin_type: 1,
      margin_nominal: 10,
      nominal_survey: 50000,
      max_order: 10,
      is_active: true,
      created_by: refs.adminHo.id,
    },
  });

  await prisma.pic_vendor.create({
    data: { vendor_id: vendor.id, user_id: ownerUser.id, pic_name: `${mode} ${key} PIC` },
  });
  await prisma.vendor_area.create({
    data: { vendor_id: vendor.id, area_id: refs.area.id, default_discount: 0, default_unit: 'unit' },
  });
  await prisma.vendor_service.create({
    data: { vendor_id: vendor.id, service_type_id: refs.serviceType.id },
  });
  await prisma.vendor_store.create({
    data: { vendor_id: vendor.id, store_id: refs.store.id },
  });

  const tukang = await prisma.tukang.create({
    data: {
      vendor_id: vendor.id,
      user_id: tukangUser.id,
      full_name: `${mode} ${key} Tukang`,
      address: `Jl. Tukang ${mode} ${key}`,
      phone_number: `0821${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      ktp_number: `3174${Math.floor(Math.random() * 100000000000).toString().padStart(11, '0')}`,
      email: `${usernameBase}.tukang@example.com`.slice(0, 45),
      bod: new Date('1990-01-01'),
      is_active: true,
      created_by: refs.adminHo.id,
    },
  });

  await prisma.tukang_service.create({ data: { tukang_id: tukang.id, service_type_id: refs.serviceType.id } });
  await prisma.tukang_area.create({ data: { tukang_id: tukang.id, area_id: refs.area.id } });

  return { vendor, tukang };
}

async function seedMode(refs: Refs, mode: ModeName) {
  const summaries: string[] = [];
  const vendorMap = {
    CONFIRMATION: await createVendor(refs, 'CONFIRMATION', mode),
    REFUND: await createVendor(refs, 'REFUND', mode),
    QUOTATION: await createVendor(refs, 'QUOTATION', mode),
    WORK_ORDER: await createVendor(refs, 'WORK_ORDER', mode),
    RESCHEDULE: await createVendor(refs, 'RESCHEDULE', mode),
    COMPLAINT: await createVendor(refs, 'COMPLAINT', mode),
  };

  for (const rule of ruleCodes) {
    for (let index = 1; index <= ORDERS_PER_RULE; index += 1) {
      const row = await seedRuleOrder(refs, vendorMap, mode, rule, index);
      summaries.push(row);
    }
  }

  return summaries;
}

async function seedRuleOrder(
  refs: Refs,
  vendorMap: Record<string, Awaited<ReturnType<typeof createVendor>>>,
  mode: ModeName,
  rule: string,
  index: number,
) {
  const group = getRuleGroup(rule);
  const { vendor, tukang } = vendorMap[group];
  const projectNumber = `${mode === 'READY' ? READY_PREFIX : EVIDENCE_PREFIX}${rule}_${index.toString().padStart(3, '0')}`;
  const orderDate = getOrderDate(rule);
  const order = await createBaseOrder(refs, vendor.id, projectNumber, getOrderStatus(refs, rule), orderDate);

  await attachScenarioData(refs, mode, rule, order.id, vendor.id, tukang.id, index);

  if (mode === 'EVIDENCE') {
    await createViolationLog(refs, rule, vendor.id, order.id, `Evidence seed for ${rule}`);
  }

  return [
    rule,
    mode,
    vendor.id,
    order.id,
    projectNumber,
    getActionInstruction(rule, mode),
    mode === 'EVIDENCE' ? `Log ${rule} already available` : `Trigger should create ${rule}`,
    '/vendor-sp/violation-log',
  ].join(' | ');
}

function getRuleGroup(rule: string) {
  if (rule.startsWith('ORDER_NOT_CONFIRMED')) return 'CONFIRMATION';
  if (rule.startsWith('REFUND')) return 'REFUND';
  if (rule.startsWith('QUOTATION')) return 'QUOTATION';
  if (rule.startsWith('STATUS') || rule === 'DOC_NOT_UPLOADED') return 'WORK_ORDER';
  if (rule.startsWith('RESCHEDULE')) return 'RESCHEDULE';
  return 'COMPLAINT';
}

function getOrderDate(rule: string) {
  if (rule.endsWith('_H1')) return daysAgo(1);
  if (rule.endsWith('_H_PLUS') || rule.endsWith('_H3') || rule.endsWith('_PLUS')) return daysAgo(3);
  if (rule.endsWith('_H2')) return daysAgo(2);
  return daysAgo(0);
}

function getOrderStatus(refs: Refs, rule: string) {
  if (rule.startsWith('ORDER_NOT_CONFIRMED')) return refs.statuses.SURVEYREQ.id;
  if (rule.startsWith('QUOTATION_LATE')) return refs.statuses.SURVEYDONE.id;
  if (rule.startsWith('STATUS')) return refs.statuses.WORKSTART.id;
  if (rule === 'DOC_NOT_UPLOADED') return refs.statuses.WORKDONE.id;
  return refs.statuses.WORKREQ.id;
}

async function createBaseOrder(refs: Refs, vendorId: number, projectNumber: string, statusId: number, createdAt: Date) {
  const order = await prisma.orders.create({
    data: {
      member_id: refs.member.id,
      store_id: refs.store.id,
      project_status_id: statusId,
      vendor_id: vendorId,
      sales_id: refs.sales.id,
      project_address: `Jl. ${projectNumber}`,
      project_number: projectNumber,
      notes: `Seed order for ${projectNumber}`,
      payment_type: 'survey',
      grand_total: 100000,
      grand_total_comission: 0,
      request_survey: createdAt,
      request_work: createdAt,
      created_by: refs.adminHo.id,
      created_at: createdAt,
    },
  });

  await prisma.order_histories.create({
    data: {
      order_id: order.id,
      status_id: statusId,
      payload: JSON.stringify({ seed: true, project_number: projectNumber }),
      created_by: refs.adminHo.id,
      created_at: createdAt,
    },
  });

  await prisma.m_order_details.create({
    data: {
      order_id: order.id,
      sales_id: refs.sales.id,
      item_code: 'SP-SEED',
      item_name: 'SP Seed Item',
      unit_price: 100000,
      quantity: 1,
      total: 100000,
      comission: 0,
      item_notes: 'Seed item',
      created_by: refs.adminHo.id,
      created_at: createdAt,
    },
  });

  return order;
}

async function attachScenarioData(
  refs: Refs,
  mode: ModeName,
  rule: string,
  orderId: number,
  vendorId: number,
  tukangId: number,
  index: number,
) {
  if (rule.startsWith('QUOTATION_LATE')) {
    const surveyDoneDate = rule === 'QUOTATION_LATE_H2' ? daysAgo(2) : daysAgo(3);
    await createWorkOrder(refs, orderId, vendorId, tukangId, refs.statuses.SURVEYDONE.id, surveyDoneDate);
    await prisma.order_histories.create({
      data: {
        order_id: orderId,
        status_id: refs.statuses.SURVEYDONE.id,
        payload: JSON.stringify({ seed: true, status: 'SURVEYDONE' }),
        created_by: refs.adminHo.id,
        created_at: surveyDoneDate,
      },
    });
    await createQuotation(refs, orderId, refs.statuses.QUOTATIONDRAFT.id, false, surveyDoneDate);
    return;
  }

  if (rule === 'QUOTATION_NOT_FULFILLED') {
    await createQuotation(refs, orderId, refs.statuses.QUOTATIONPAID.id, true, daysAgo(0));
    if (mode === 'EVIDENCE') {
      await createRefund(refs, orderId, `Evidence refund for ${rule}`);
    }
    return;
  }

  if (rule.startsWith('REFUND')) {
    if (rule === 'REFUND_6_10_PER_QUARTER' && mode === 'READY' && index === 1) {
      for (let existing = 1; existing <= 5; existing += 1) {
        const existingOrder = await createBaseOrder(
          refs,
          vendorId,
          `${READY_PREFIX}REFUND_EXISTING_${existing.toString().padStart(3, '0')}`,
          refs.statuses.WORKREQ.id,
          daysAgo(0),
        );
        await createRefund(refs, existingOrder.id, 'Existing refund count seed for 6-10 threshold');
      }
    }
    if (mode === 'EVIDENCE') {
      await createRefund(refs, orderId, `Evidence refund for ${rule}`);
    }
    return;
  }

  if (rule.startsWith('STATUS')) {
    const staleDate = rule === 'STATUS_NOT_UPDATED_H1' ? daysAgo(1) : rule === 'STATUS_NOT_UPDATED_H_PLUS' ? daysAgo(3) : daysAgo(0);
    await createWorkOrder(refs, orderId, vendorId, tukangId, refs.statuses.WORKSTART.id, staleDate);
    return;
  }

  if (rule === 'DOC_NOT_UPLOADED') {
    await createWorkOrder(refs, orderId, vendorId, tukangId, refs.statuses.WORKDONE.id, daysAgo(0));
    return;
  }

  if (rule.startsWith('RESCHEDULE')) {
    const statusId = rule === 'RESCHEDULE_NOT_UPDATED' ? refs.statuses.RESCHEDULE.id : refs.statuses.RESCHEDULEAPPROVEDBYVENDOR.id;
    await createWorkOrder(refs, orderId, vendorId, tukangId, refs.statuses.WORKREQ.id, daysAgo(1));
    await createReschedule(refs, orderId, tukangId, statusId, rule === 'RESCHEDULE_CHANGE_SCHEDULE' ? daysAgo(0) : daysAgo(2));
  }
}

async function createWorkOrder(refs: Refs, orderId: number, vendorId: number, tukangId: number, statusId: number, createdAt: Date) {
  const workOrder = await prisma.work_orders.create({
    data: {
      order_id: orderId,
      vendor_id: vendorId,
      status_id: statusId,
      session: 1,
      request_work_time: createdAt,
      survey_date: createdAt,
      work_start_date: createdAt,
      work_end_date: createdAt,
      created_by: refs.adminHo.id,
      created_at: createdAt,
    },
  });

  await prisma.work_order_status.create({
    data: {
      work_order_id: workOrder.id,
      status_id: statusId,
      work_date_time: createdAt,
      work_start_date: createdAt,
      work_end_date: createdAt,
      description: 'Seed work order status',
      created_by: refs.adminHo.id,
      created_at: createdAt,
    },
  });

  await prisma.work_order_tukang.create({
    data: {
      work_order_id: workOrder.id,
      tukang_id: tukangId,
      type: 2,
      notes: 'Seed tukang assignment',
      created_by: refs.adminHo.id,
      created_at: createdAt,
    },
  });

  return workOrder;
}

async function createQuotation(refs: Refs, orderId: number, statusId: number, paid: boolean, createdAt: Date) {
  const quotation = await prisma.quotation.create({
    data: {
      store_id: refs.store.id,
      order_id: orderId,
      quotation_status: statusId,
      description: 'Seed quotation for Vendor SP rule testing',
      quotation_number: `${PREFIX}Q-${orderId}`,
      quotation_date: createdAt,
      quotation_validity: daysAgo(-14),
      quotation_disc: 0,
      quotation_promotion: 0,
      quotation_grand_total: 100000,
      quotation_no_promotion: 100000,
      receipt_quotation: paid ? `${PREFIX}RCPT-${orderId}` : null,
      created_by: refs.adminHo.id,
      created_at: createdAt,
    },
  });

  await prisma.quotation_details.create({
    data: {
      quotation_id: quotation.id,
      item_type: 1,
      name: 'Seed quotation item',
      price: 100000,
      final_price: 100000,
      quantity: 1,
      unit: 'unit',
      created_by: refs.adminHo.id,
      created_at: createdAt,
    },
  });

  if (paid) {
    await prisma.quotation_receipt.create({
      data: {
        quotation_id: quotation.id,
        quotation_step: 1,
        receipt_quotation: `${PREFIX}RCPT-${orderId}`,
        created_by: refs.adminHo.id,
        created_at: createdAt,
      },
    });
  }

  return quotation;
}

async function createRefund(refs: Refs, orderId: number, reason: string) {
  return prisma.refund.create({
    data: {
      order_id: orderId,
      refund_status: refs.statuses.REFUNDREQ.id,
      notes: reason,
      reason,
      paid_status: 0,
      penalty_nominal: 0,
      date_of_filing: new Date(),
      created_by: refs.adminHo.id,
    },
  });
}

async function createReschedule(refs: Refs, orderId: number, tukangId: number, statusId: number, rescheduleDate: Date) {
  const reschedule = await prisma.reschedule.create({
    data: {
      order_id: orderId,
      status_id: statusId,
      reschedule_date: rescheduleDate,
      confirm_date: null,
      created_by: refs.adminHo.id,
      created_at: rescheduleDate,
    },
  });

  await prisma.reschedule_status.create({
    data: {
      reschedule_id: reschedule.id,
      status_id: statusId,
      status_by: 'VENDOR',
      description: 'Seed reschedule status',
      created_by: refs.adminHo.id,
      created_at: rescheduleDate,
    },
  });

  await prisma.reschedule_tukang.create({
    data: {
      reschedule_id: reschedule.id,
      tukang_id: tukangId,
      created_by: refs.adminHo.id,
      created_at: rescheduleDate,
    },
  });

  return reschedule;
}

async function createViolationLog(refs: Refs, rule: string, vendorId: number, orderId: number | null, description: string) {
  const type = await prisma.vendor_violation_type.findFirst({
    where: { code: rule, deleted_at: null },
  });
  if (!type) throw new Error(`Violation type ${rule} not found`);

  const { quarter, year } = currentQuarter();
  return prisma.vendor_violation_log.create({
    data: {
      vendor_id: vendorId,
      violation_type_id: type.id,
      order_id: orderId,
      quarter,
      year,
      description,
      is_active: true,
      created_by: refs.adminHo.id,
    },
  });
}

function getActionInstruction(rule: string, mode: ModeName) {
  if (mode === 'EVIDENCE') return 'Open screenshot route';
  if (rule.startsWith('ORDER_NOT_CONFIRMED')) return 'Run daily violation scheduler';
  if (rule.startsWith('REFUND')) return 'Submit refund from UI/API';
  if (rule === 'QUOTATION_NOT_FULFILLED') return 'Submit refund for paid quotation order';
  if (rule.startsWith('QUOTATION_LATE')) return 'Run late quotation scheduler';
  if (rule === 'DOC_NOT_UPLOADED') return 'Submit final work order status without before/after photos';
  if (rule.startsWith('STATUS')) return 'Run stale work order scheduler';
  if (rule === 'RESCHEDULE_NOT_UPDATED') return 'Run pending reschedule scheduler';
  if (rule === 'RESCHEDULE_CHANGE_SCHEDULE') return 'Update reschedule date on execution day';
  if (rule === 'CUSTOMER_COMPLAINT') return 'Submit complaint from UI/API';
  return 'Trigger rule from UI/API';
}

async function seedThresholdEvidence(refs: Refs) {
  const summaries: string[] = [];
  summaries.push(await seedThresholdVendor(refs, 'SP1', 25, 1, true));
  summaries.push(await seedThresholdVendor(refs, 'SP2', 50, 2, true));
  summaries.push(await seedThresholdVendor(refs, 'SP3', 55, 3, false));
  return summaries;
}

async function seedThresholdVendor(refs: Refs, label: string, points: number, spLevel: number, isActive: boolean) {
  const { vendor } = await createVendor(refs, `THRESHOLD_${label}`, 'EVIDENCE');
  await prisma.vendor.update({
    where: { id: vendor.id },
    data: { is_active: isActive },
  });

  const logs = [];
  for (let index = 1; index <= points; index += 1) {
    logs.push(await createViolationLog(refs, ruleCodes[(index - 1) % ruleCodes.length], vendor.id, null, `Threshold ${label} point ${index}`));
  }

  const sp = await prisma.vendor_sp.create({
    data: {
      vendor_id: vendor.id,
      sp_level: spLevel,
      total_point: points,
      ...currentQuarter(),
      start_date: new Date(),
      end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      status: 1,
      allocation_reduction: spLevel === 1 ? 50 : spLevel === 2 ? 75 : 100,
      notes: `${PREFIX}threshold evidence ${label}`,
      created_by: refs.adminHo.id,
    },
  });

  await prisma.vendor_sp_detail.createMany({
    data: logs.slice(0, 20).map((log) => ({
      vendor_sp_id: sp.id,
      violation_log_id: log.id,
      created_by: refs.adminHo.id,
    })),
  });

  return [
    `THRESHOLD_${label}`,
    'EVIDENCE',
    vendor.id,
    '-',
    `${PREFIX}THRESHOLD_${label}`,
    'Open /vendor-sp/view',
    `Vendor should show ${label}`,
    '/vendor-sp/view',
  ].join(' | ');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
