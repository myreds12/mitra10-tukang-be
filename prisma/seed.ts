/* eslint-disable prettier/prettier */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seeder Database Lengkap untuk Testing Vendor SP System
 * Urutan seeding mengikuti foreign key constraints
 */

async function main() {
  console.log('🚀 Starting database seeding...\n');

  // ============================================
  // 1. MASTER DATA
  // ============================================

  console.log('📦 Seeding Master Data...');

  // Bank
  const banks = await Promise.all([
    prisma.bank.create({
      data: { bank_name: 'Bank BCA' },
    }),
    prisma.bank.create({
      data: { bank_name: 'Bank Mandiri' },
    }),
    prisma.bank.create({
      data: { bank_name: 'Bank BRI' },
    }),
    prisma.bank.create({
      data: { bank_name: 'Bank BNI' },
    }),
    prisma.bank.create({
      data: { bank_name: 'Bank CIMB Niaga' },
    }),
  ]);
  console.log(`   ✅ Banks: ${banks.length} created`);

  // Province
  const provinces = await Promise.all([
    prisma.province.create({ data: { province_name: 'DKI Jakarta' } }),
    prisma.province.create({ data: { province_name: 'Jawa Barat' } }),
    prisma.province.create({ data: { province_name: 'Jawa Tengah' } }),
    prisma.province.create({ data: { province_name: 'Jawa Timur' } }),
    prisma.province.create({ data: { province_name: 'Banten' } }),
  ]);
  console.log(`   ✅ Provinces: ${provinces.length} created`);

  // City
  const cities = await Promise.all([
    prisma.city.create({ data: { province_id: provinces[0].id, city_name: 'Jakarta Selatan' } }),
    prisma.city.create({ data: { province_id: provinces[0].id, city_name: 'Jakarta Pusat' } }),
    prisma.city.create({ data: { province_id: provinces[1].id, city_name: 'Bandung' } }),
    prisma.city.create({ data: { province_id: provinces[1].id, city_name: 'Bekasi' } }),
    prisma.city.create({ data: { province_id: provinces[4].id, city_name: 'Tangerang' } }),
  ]);
  console.log(`   ✅ Cities: ${cities.length} created`);

  // Area
  const areas = await Promise.all([
    prisma.area.create({ data: { area: 'Jakarta Selatan' } }),
    prisma.area.create({ data: { area: 'Jakarta Barat' } }),
    prisma.area.create({ data: { area: 'Bandung Kota' } }),
    prisma.area.create({ data: { area: 'Bekasi' } }),
    prisma.area.create({ data: { area: 'Tangerang' } }),
  ]);
  console.log(`   ✅ Areas: ${areas.length} created`);

  // Roles
  const roles = await Promise.all([
    prisma.roles.create({ data: { name: 'Super User' } }),
    prisma.roles.create({ data: { name: 'Admin HO' } }),
    prisma.roles.create({ data: { name: 'Owner Vendor' } }),
    prisma.roles.create({ data: { name: 'Admin Vendor' } }),
    prisma.roles.create({ data: { name: 'Sales' } }),
    prisma.roles.create({ data: { name: 'Manager Store' } }),
    prisma.roles.create({ data: { name: 'Tukang' } }),
    prisma.roles.create({ data: { name: 'Store CS' } }),
  ]);
  console.log(`   ✅ Roles: ${roles.length} created`);

  // Positions
  const positions = await Promise.all([
    prisma.positions.create({ data: { position_name: 'Manager' } }),
    prisma.positions.create({ data: { position_name: 'Supervisor' } }),
    prisma.positions.create({ data: { position_name: 'Staff' } }),
  ]);
  console.log(`   ✅ Positions: ${positions.length} created`);

  // Service Types
  const serviceTypes = await Promise.all([
    prisma.service_type.create({ data: { service_type: 'Instalasi' } }),
    prisma.service_type.create({ data: { service_type: 'Service' } }),
    prisma.service_type.create({ data: { service_type: 'Perbaikan' } }),
    prisma.service_type.create({ data: { service_type: 'Maintenance' } }),
  ]);
  console.log(`   ✅ Service Types: ${serviceTypes.length} created`);

  // Categories
  const categories = await Promise.all([
    prisma.categories.create({ data: { category_name: 'Pemasangan Lantai' } }),
    prisma.categories.create({ data: { category_name: 'Pemasangan Dinding' } }),
    prisma.categories.create({ data: { category_name: 'Pemasangan Plafon' } }),
    prisma.categories.create({ data: { category_name: 'Service AC' } }),
    prisma.categories.create({ data: { category_name: 'Reparasi' } }),
  ]);
  console.log(`   ✅ Categories: ${categories.length} created`);

  // Complaint Channels
  const complaintChannels = await Promise.all([
    prisma.complaint_channels.create({ data: { name: 'Telepon' } }),
    prisma.complaint_channels.create({ data: { name: 'Email' } }),
    prisma.complaint_channels.create({ data: { name: 'WhatsApp' } }),
    prisma.complaint_channels.create({ data: { name: 'Website' } }),
  ]);
  console.log(`   ✅ Complaint Channels: ${complaintChannels.length} created`);

  // Store Groups
  const storeGroups = await Promise.all([
    prisma.store_group.create({ data: { group_name: 'Mitra10 Group' } }),
  ]);
  console.log(`   ✅ Store Groups: ${storeGroups.length} created`);

  // ============================================
  // 2. STATUS MASTER DATA (Using createMany with skipDuplicates + manual update)
  // ============================================
  console.log('\n📋 Seeding/Updating Status...');

  const statusData = [
    // Order Status - Booking
    { category: 'BOOK', description: 'Memesan' },
    { category: 'BOOKED', description: 'Dipesan' },
    // Order Status - Investigation
    { category: 'INVESTIGATE', description: 'Menyelesaikan' },
    { category: 'INVESTIGATED', description: 'Diselidiki' },
    // Order Status - Survey
    { category: 'SURVEYREQ', description: 'Permintaan Survei' },
    { category: 'SURVEYSTART', description: 'Mulai Survei' },
    { category: 'SURVEYDONE', description: 'Survei Selesai' },
    { category: 'RESURVEYREQ', description: 'Permintaan Survei Ulang' },
    { category: 'RESURVEYSTART', description: 'Mulai Survei Ulang' },
    { category: 'RESURVEYDONE', description: 'Survei Ulang Selesai' },
    { category: 'TUKANGSURVEY', description: 'Tukang ditugaskan untuk survey' },
    { category: 'SIP', description: 'Survey sedang dilakukan' },
    // Order Status - Quotation
    { category: 'QUOTEIN', description: 'Quotation dikirim ke HO' },
    { category: 'QUOTEOUT', description: 'Quotation dikirim ke Customers' },
    { category: 'QUOTATIONDRAFT', description: 'Draft Quotation' },
    { category: 'QUOTATIONPAID', description: 'Quotation Sudah Dibayar' },
    { category: 'QUOTATIONPAIDSTEPONE', description: 'Quotation sudah dibayar Tahap 1' },
    { category: 'QUOTATIONPAIDSTEPTWO', description: 'Quotation sudah dibayar Tahap 2' },
    { category: 'QUOTATIONPAIDSTEPTHREE', description: 'Quotation sudah dibayar Tahap 3' },
    // Order Status - Work
    { category: 'WORKREQ', description: 'Permintaan Perintah Kerja' },
    { category: 'WORKREQSTEPTWO', description: 'Permintaan Pengerjaan Tahap 2' },
    { category: 'WORKREQSTEPONE', description: 'Permintaan Pengerjaan Tahap 1' },
    { category: 'WORKREQSTEPTHREE', description: 'Permintaan Pengerjaan Tahap 3' },
    { category: 'WORKSTART', description: 'Perintah Kerja Dimulai' },
    { category: 'WORKSTARTSTEPONE', description: 'Perintah Mulai Kerja Tahap 1' },
    { category: 'WORKSTARTSTEPTWO', description: 'Perintah Mulai Kerja Tahap 2' },
    { category: 'WORKSTARTSTEPTHREE', description: 'Perintah Mulai Kerja Tahap 3' },
    { category: 'WIP', description: 'Pekerjaan Sedang Berlangsung' },
    { category: 'WORKEND', description: 'Perintah Kerja Berakhir' },
    { category: 'WORKENDSTEPONE', description: 'Perintah Kerja Berakhir Tahap 1' },
    { category: 'WORKENDSTEPTWO', description: 'Perintah Kerja Berakhir Tahap 2' },
    { category: 'WORKENDSTEPTHREE', description: 'Perintah Kerja Berakhir Tahap 3' },
    { category: 'REWORKREQ', description: 'Permintaan Pengerjaan Ulang' },
    { category: 'REWORKSTART', description: 'Pengerjaan Ulang Mulai' },
    { category: 'REWORKEND', description: 'Pengerjaan Ulang Selesai' },
    // Order Status - Tukang Assignment
    { category: 'TUKANGWORK', description: 'Tukang ditugaskan untuk pengerjaan' },
    { category: 'TUKANGWORKSTEPONE', description: 'Tukang ditugaskan kerja tahap 1' },
    { category: 'TUKANGWORKSTEPTWO', description: 'Tukang ditugaskan kerja tahap 2' },
    { category: 'TUKANGWORKSTEPTHREE', description: 'Tukang ditugaskan kerja tahap 3' },
    { category: 'RETUKANGWORK', description: 'Tukang ditugaskan pengerjaan ulang' },
    { category: 'RETUKANGWORKSTEPONE', description: 'Tukang ditugaskan pengerjaan ulang tahap 1' },
    { category: 'RETUKANGWORKSTEPTWO', description: 'Tukang ditugaskan pengerjaan ulang tahap 2' },
    { category: 'RETUKANGWORKSTEPTHREE', description: 'Tukang ditugaskan pengerjaan ulang tahap 3' },
    { category: 'RETUKANGSURVEY', description: 'Tukang ditugaskan survey ulang' },
    // Order Status - Invoice
    { category: 'INVOICEDRAFT', description: 'Draf Invoice' },
    { category: 'INVOICE', description: 'Invoice' },
    { category: 'INVOICESEND', description: 'Invoice Terkirim' },
    { category: 'CSIOUT', description: 'CSI Keluar' },
    // Order Status - Payment
    { category: 'UNPAID', description: 'Belum dibayar' },
    { category: 'PAID', description: 'Dibayar' },
    // Order Status - Other
    { category: 'REFUND', description: 'Pengembalian dana' },
    { category: 'ACCEPTED', description: 'Diterima' },
    { category: 'APPROVED', description: 'Disetujui' },
    { category: 'REJECTED', description: 'Ditolak' },
    { category: 'RESCHEDULE', description: 'Menjadwalkan ulang' },
    { category: 'RESCHEDULEAPPROVEDBYHO', description: 'Reschedule approved by ho' },
    { category: 'RESCHEDULEAPPROVEDBYVENDOR', description: 'Penjadwalan ulang disetujui vendor' },
    { category: 'RESCHEDULEREJECTEDBYVENDOR', description: 'Penjadwalan ulang ditolak vendor' },
    { category: 'WARRANTYCLAIM', description: 'Klaim garansi' },
    { category: 'FEEDBACK', description: 'Masukan' },
    { category: 'NONE', description: 'None' },
    { category: 'PENDING', description: 'Pending' },
    { category: 'DONE', description: 'Done' },
    { category: 'PICKLIST', description: 'Picklist' },
    // Complaint Status
    { category: 'COMPLAINTAPPROVEDBYHO', description: 'Approved by HO' },
    { category: 'COMPLAINTAPPROVEDBYVENDOR', description: 'Approved by Vendor' },
    { category: 'COMPLAINTREJECTEDBYHO', description: 'Rejected by HO' },
    { category: 'COMPLAINTREJECTEDBYVENDOR', description: 'REJECTEDBYVENDOR' },
    { category: 'COMPLAINTOPEN', description: 'Komplain Baru' },
    { category: 'COMPLAINTDONE', description: 'Komplain Selesai' },
    // Refund Status
    { category: 'REFUNDPENDING', description: 'Refund Pending' },
    { category: 'REFUNDAPPROVEDBYHO', description: 'Refund Disetujui oleh HO' },
    { category: 'REFUNDREJECTEDBYHO', description: 'Refund Ditolak oleh HO' },
    // Cancel
    { category: 'CANCEL', description: 'Cancel' },
    { category: 'CANCELREFUND', description: 'Cancel dan Refund' },
  ];

  // First, get all existing statuses to build a map by category
  const existingStatuses = await prisma.status.findMany();
  const existingByCategory = new Map(existingStatuses.map(s => [s.category, s]));

  // Process each status - create if not exists, update description if exists
  for (const status of statusData) {
    const existing = existingByCategory.get(status.category);
    if (existing) {
      // Update existing status description
      await prisma.status.update({
        where: { id: existing.id },
        data: { description: status.description },
      });
    } else {
      // Create new status
      await prisma.status.create({
        data: { category: status.category, description: status.description },
      });
    }
  }
  console.log(`   ✅ Statuses: ${statusData.length} seeded/updated`);

  // ============================================
  // 3. STORES & USERS
  // ============================================
  console.log('\n🏪 Seeding Stores & Users...');

  // Password hashes generated with bcrypt (verified)
  // admin123 -> $2b$10$T9MvsCs19yu1c5Jl4.TNGeAhK9U3X7KnzWdzKU4xqKrTNNVd6QstC
  // password123 -> $2b$10$vJ6cLuPYjrRx9TU00lTr9eiODUxcr/8zcT1RMjgY9RdWKP9BBD3jC
  // sales123 -> $2b$10$sqq/uHKQoAPnypLaux/r3Ofs6bvQjOW13oTdQAV9mKP3kQrJVIvTK
  // tukang123 -> $2b$10$0FG80D70wHeSVnj4fsTdPOjUeu0uwtgHLvKsfLmA1.KxyvthN8Cja
  // store123 -> $2b$10$WZNL474pd7xogLEp/UOMnuvsB/875vIAJ2FPA96QGjpaQk0TwZ9Km

  // Delete existing users with these usernames first
  await prisma.users.deleteMany({
    where: {
      username: {
        in: ['admin_ho', 'admin_ho2', 'vendor_owner_1', 'sales_1', 'sales_2', 'manager_store', 'tukang_1', 'tukang_2']
      }
    }
  });

  const users = await Promise.all([
    // Admin HO - Super User
    prisma.users.create({
      data: {
        username: 'admin_ho',
        password: '$2b$10$T9MvsCs19yu1c5Jl4.TNGeAhK9U3X7KnzWdzKU4xqKrTNNVd6QstC',
        role_id: roles[0].id, // Super User
        is_active: true,
      },
    }),
    // Admin HO
    prisma.users.create({
      data: {
        username: 'admin_ho2',
        password: '$2b$10$T9MvsCs19yu1c5Jl4.TNGeAhK9U3X7KnzWdzKU4xqKrTNNVd6QstC',
        role_id: roles[1].id, // Admin HO
        is_active: true,
      },
    }),
    // Owner Vendor
    prisma.users.create({
      data: {
        username: 'vendor_owner_1',
        password: '$2b$10$vJ6cLuPYjrRx9TU00lTr9eiODUxcr/8zcT1RMjgY9RdWKP9BBD3jC',
        role_id: roles[2].id, // Owner Vendor
        is_active: true,
      },
    }),
    // Sales
    prisma.users.create({
      data: {
        username: 'sales_1',
        password: '$2b$10$sqq/uHKQoAPnypLaux/r3Ofs6bvQjOW13oTdQAV9mKP3kQrJVIvTK',
        role_id: roles[4].id, // Sales
        is_active: true,
      },
    }),
    prisma.users.create({
      data: {
        username: 'sales_2',
        password: '$2b$10$sqq/uHKQoAPnypLaux/r3Ofs6bvQjOW13oTdQAV9mKP3kQrJVIvTK',
        role_id: roles[4].id, // Sales
        is_active: true,
      },
    }),
    // Manager Store
    prisma.users.create({
      data: {
        username: 'manager_store',
        password: '$2b$10$WZNL474pd7xogLEp/UOMnuvsB/875vIAJ2FPA96QGjpaQk0TwZ9Km',
        role_id: roles[5].id, // Manager Store
        is_active: true,
      },
    }),
    // Tukang
    prisma.users.create({
      data: {
        username: 'tukang_1',
        password: '$2b$10$0FG80D70wHeSVnj4fsTdPOjUeu0uwtgHLvKsfLmA1.KxyvthN8Cja',
        role_id: roles[6].id, // Tukang
        is_active: true,
      },
    }),
    prisma.users.create({
      data: {
        username: 'tukang_2',
        password: '$2b$10$0FG80D70wHeSVnj4fsTdPOjUeu0uwtgHLvKsfLmA1.KxyvthN8Cja',
        role_id: roles[6].id, // Tukang
        is_active: true,
      },
    }),
  ]);

  const stores = await Promise.all([
    prisma.store.create({
      data: {
        store_name: 'Mitra10 Sudirman',
        address: 'Jl. Sudirman No. 100',
        email: 'sudirman@mitra10.com',
        phone_number_1: '021-12345678',
        area_id: areas[0].id,
        store_group_id: storeGroups[0].id,
        user_id: users[0].id, // admin_ho as owner
      },
    }),
    prisma.store.create({
      data: {
        store_name: 'Mitra10 Bandung',
        address: 'Jl. Asia Afrika No. 50',
        email: 'bandung@mitra10.com',
        phone_number_1: '022-87654321',
        area_id: areas[2].id,
        store_group_id: storeGroups[0].id,
        user_id: users[5].id, // manager_store as owner
      },
    }),
  ]);
  console.log(`   ✅ Stores: ${stores.length} created`);
  console.log(`   ✅ Users: ${users.length} created`);

  // ============================================
  // 3.5. SALES
  // ============================================
  console.log('\n💼 Seeding Sales...');

  // Sales linked to users with Sales role (users[3] = sales_1, users[4] = sales_2)
  const sales = await Promise.all([
    // Sales 1 - Mitra10 Sudirman
    prisma.sales.create({
      data: {
        user_id: users[3].id,       // sales_1 user
        store_id: stores[0].id,    // Mitra10 Sudirman
        full_name: 'Sales Budi Santoso',
        nik: '3201234567890001',
        bank_id: banks[0].id,      // Bank BCA
        bank_branch: 'Cabang Sudirman',
        account_name: 'Budi Santoso',
        account_number: '1234567890',
        phone_number: '081234567891',
        sales_brand: 'Mitra10',
        is_active: true,
      },
    }),
    // Sales 2 - Mitra10 Bandung
    prisma.sales.create({
      data: {
        user_id: users[4].id,       // sales_2 user
        store_id: stores[1].id,    // Mitra10 Bandung
        full_name: 'Sales Rina Wijaya',
        nik: '3201234567890002',
        bank_id: banks[1].id,      // Bank Mandiri
        bank_branch: 'Cabang Braga',
        account_name: 'Rina Wijaya',
        account_number: '9876543210',
        phone_number: '081234567892',
        sales_brand: 'Mitra10',
        is_active: true,
      },
    }),
  ]);
  console.log(`   ✅ Sales: ${sales.length} created`);

  // Sales Categories (commission per category)
  const salesCategories = await Promise.all([
    // Sales 1 - Category 1 (Pemasangan Lantai) commission 5%
    prisma.sales_categories.create({
      data: {
        sales_id: sales[0].id,
        category_id: categories[0].id,
        commission: 5.00,
      },
    }),
    // Sales 1 - Category 2 (Pemasangan Dinding) commission 4%
    prisma.sales_categories.create({
      data: {
        sales_id: sales[0].id,
        category_id: categories[1].id,
        commission: 4.00,
      },
    }),
    // Sales 1 - Category 3 (Pemasangan Plafon) commission 3%
    prisma.sales_categories.create({
      data: {
        sales_id: sales[0].id,
        category_id: categories[2].id,
        commission: 3.00,
      },
    }),
    // Sales 2 - Category 1 (Pemasangan Lantai) commission 5%
    prisma.sales_categories.create({
      data: {
        sales_id: sales[1].id,
        category_id: categories[0].id,
        commission: 5.00,
      },
    }),
    // Sales 2 - Category 4 (Service AC) commission 6%
    prisma.sales_categories.create({
      data: {
        sales_id: sales[1].id,
        category_id: categories[3].id,
        commission: 6.00,
      },
    }),
  ]);
  console.log(`   ✅ Sales Categories: ${salesCategories.length} created`);

  // ============================================
  // 4. VENDORS & TUKANG
  // ============================================
  console.log('\n🏢 Seeding Vendors...');

  // Vendor 1 - Normal (Aktif, tidak ada SP)
  const vendors = await Promise.all([
    prisma.vendor.create({
      data: {
        company_name: 'CV. Pasang Lantai Jaya',
        address: 'Jl. Veteran No. 10',
        phone_number: '081234567890',
        email_address: 'vendor1@email.com',
        pic_name: 'Budi Santoso',
        bank_id: banks[0].id,
        is_active: true,
        max_order: 5,
        join_date: new Date('2024-01-15'),
      },
    }),
    // Vendor 2 - SP1 (Aktif)
    prisma.vendor.create({
      data: {
        company_name: 'PT. Pasang Dinding Prima',
        address: 'Jl. Gatot Subroto No. 25',
        phone_number: '081234567891',
        email_address: 'vendor2@email.com',
        pic_name: 'Ahmad Wijaya',
        bank_id: banks[1].id,
        is_active: true,
        max_order: 3,
        join_date: new Date('2024-02-20'),
      },
    }),
    // Vendor 3 - SP3 (Nonaktif)
    prisma.vendor.create({
      data: {
        company_name: 'UD. Service Elektronik Bersama',
        address: 'Jl. Merdeka No. 50',
        phone_number: '081234567892',
        email_address: 'vendor3@email.com',
        pic_name: 'Dewi Lestari',
        bank_id: banks[2].id,
        is_active: false, // Nonaktif karena SP3
        max_order: 0,
        join_date: new Date('2024-03-10'),
      },
    }),
  ]);
  console.log(`   ✅ Vendors: ${vendors.length} created`);

  // Tukang
  const tukangs = await Promise.all([
    prisma.tukang.create({
      data: {
        vendor_id: vendors[0].id,
        full_name: 'Tukang Aji',
        address: 'Jl. Tukang 1',
        phone_number: '088888888881',
        email: 'tukang.aji@email.com',
        bod: new Date('1990-05-15'),
        is_active: true,
      },
    }),
    prisma.tukang.create({
      data: {
        vendor_id: vendors[1].id,
        full_name: 'Tukang Beno',
        address: 'Jl. Tukang 2',
        phone_number: '088888888882',
        email: 'tukang.beno@email.com',
        bod: new Date('1991-08-20'),
        is_active: true,
      },
    }),
  ]);
  console.log(`   ✅ Tukangs: ${tukangs.length} created`);

  // ============================================
  // 5. MEMBERS (CUSTOMERS)
  // ============================================
  console.log('\n👤 Seeding Members...');

  const members = await Promise.all([
    prisma.members.create({
      data: {
        full_name: 'John Doe',
        email: 'john.doe@email.com',
        phone_number: '087777777771',
        whatsapp_number: '62877777771',
        address_1: 'Jl. Customer 1',
        join_location: stores[0].id,
        area_id: areas[0].id,
      },
    }),
    prisma.members.create({
      data: {
        full_name: 'Jane Smith',
        email: 'jane.smith@email.com',
        phone_number: '087777777772',
        whatsapp_number: '62877777772',
        address_1: 'Jl. Customer 2',
        join_location: stores[1].id,
        area_id: areas[1].id,
      },
    }),
  ]);
  console.log(`   ✅ Members: ${members.length} created`);

  // ============================================
  // 6. ITEMS
  // ============================================
  console.log('\n📦 Seeding Items...');

  const items = await Promise.all([
    prisma.items.create({
      data: {
        item_name: 'Pemasangan Granit 60x60',
        item_code: 'GRANIT60X60',
        service_name: 'Pemasangan Granit',
        default_price: 150000,
        category_id: categories[0].id,
        type: 2,
        invoice_nominal: 150000,
        invoices_prices: 175000,
      },
    }),
    prisma.items.create({
      data: {
        item_name: 'Pemasangan Dinding 30x30',
        item_code: 'DINDING30X30',
        service_name: 'Pemasangan Dinding Keramik',
        default_price: 75000,
        category_id: categories[1].id,
        type: 2,
        invoice_nominal: 75000,
        invoices_prices: 90000,
      },
    }),
    prisma.items.create({
      data: {
        item_name: 'Service AC Split',
        item_code: 'SVC-ACSPLIT',
        service_name: 'Service AC',
        default_price: 100000,
        category_id: categories[3].id,
        type: 1, // GRATIS
        invoice_nominal: 0,
        invoices_prices: 0,
      },
    }),
  ]);
  console.log(`   ✅ Items: ${items.length} created`);

  // ============================================
  // 7. ORDERS
  // ============================================
  console.log('\n📝 Seeding Orders...');

  const statusSurveyReq = await prisma.status.findFirst({ where: { category: 'SURVEYREQ' } });
  const statusSurveydone = await prisma.status.findFirst({ where: { category: 'SURVEYDONE' } });
  const statusWorkReq = await prisma.status.findFirst({ where: { category: 'WORKREQ' } });

  const orders = await Promise.all([
    // Order 1 - Normal (ke Vendor 1)
    prisma.orders.create({
      data: {
        member_id: members[0].id,
        store_id: stores[0].id,
        vendor_id: vendors[0].id,
        project_status_id: statusSurveyReq.id,
        project_address: 'Jl. Order 1 No. 5',
        payment_type: 'survey',
        grand_total: 500000,
      },
    }),
    // Order 2 - Dengan Vendor 2 (SP1)
    prisma.orders.create({
      data: {
        member_id: members[1].id,
        store_id: stores[0].id,
        vendor_id: vendors[1].id,
        project_status_id: statusSurveydone.id,
        project_address: 'Jl. Order 2 No. 10',
        payment_type: 'pemasangan_tanpa_survey',
        grand_total: 750000,
      },
    }),
    // Order 3 - Dengan Vendor 3 (SP3 - nonaktif)
    prisma.orders.create({
      data: {
        member_id: members[0].id,
        store_id: stores[1].id,
        vendor_id: vendors[2].id,
        project_status_id: statusWorkReq.id,
        project_address: 'Jl. Order 3 No. 15',
        payment_type: 'survey',
        grand_total: 300000,
      },
    }),
  ]);
  console.log(`   ✅ Orders: ${orders.length} created`);

  // ============================================
  // 8. VENDOR VIOLATION TYPES
  // ============================================
  console.log('\n⚠️ Seeding Violation Types...');

  const violationTypes = await Promise.all([
    // KONFIRMASI ORDER
    prisma.vendor_violation_type.create({
      data: {
        code: 'ORDER_NOT_CONFIRMED_H',
        category: 'KONFIRMASI_ORDER',
        name: 'Orderan tidak terkonfirmasi pada Hari H',
        description: 'Vendor tidak mengkonfirmasi order pada tanggal yang dijadwalkan (Hari H)',
        point: 1,
      },
    }),
    prisma.vendor_violation_type.create({
      data: {
        code: 'ORDER_NOT_CONFIRMED_H1',
        category: 'KONFIRMASI_ORDER',
        name: 'Orderan tidak terkonfirmasi pada H+1',
        description: 'Vendor tidak mengkonfirmasi order pada H+1 sejak penjadwalan',
        point: 1,
      },
    }),
    prisma.vendor_violation_type.create({
      data: {
        code: 'ORDER_NOT_CONFIRMED_H_PLUS',
        category: 'KONFIRMASI_ORDER',
        name: 'Orderan tidak terkonfirmasi pada >H+1',
        description: 'Vendor tidak mengkonfirmasi order lebih dari H+1',
        point: 1,
      },
    }),
    // RESCHEDULE
    prisma.vendor_violation_type.create({
      data: {
        code: 'RESCHEDULE_NOT_UPDATED',
        category: 'RESCHEDULE',
        name: 'Tidak update status order sejak tanggal reschedule diajukan',
        description: 'Vendor tidak mengupdate status order di Aplikasi Tukang sejak tanggal reschedule diajukan',
        point: 1,
      },
    }),
    prisma.vendor_violation_type.create({
      data: {
        code: 'RESCHEDULE_CHANGE_SCHEDULE',
        category: 'RESCHEDULE',
        name: 'Mengubah jadwal survey/pengerjaan saat hari pelaksanaan',
        description: 'Vendor mengubah jadwal survey atau pengerjaan pada hari pelaksanaan',
        point: 1,
      },
    }),
    // REFUND
    prisma.vendor_violation_type.create({
      data: {
        code: 'REFUND_5_PER_QUARTER',
        category: 'REFUND',
        name: '5 order refund per quarter',
        description: 'Vendor memiliki 5 order refund dalam satu quarter',
        point: 1,
      },
    }),
    prisma.vendor_violation_type.create({
      data: {
        code: 'REFUND_6_10_PER_QUARTER',
        category: 'REFUND',
        name: '6-10 order refund per quarter',
        description: 'Vendor memiliki 6-10 order refund dalam satu quarter',
        point: 1,
      },
    }),
    // LAINNYA
    prisma.vendor_violation_type.create({
      data: {
        code: 'CUSTOMER_COMPLAINT',
        category: 'LAINNYA',
        name: 'Komplain customer (jadwal/pengerjaan)',
        description: 'Customer mengajukan komplain terkait jadwal atau pengerjaan',
        point: 1,
      },
    }),
    prisma.vendor_violation_type.create({
      data: {
        code: 'QUOTATION_NOT_FULFILLED',
        category: 'LAINNYA',
        name: 'Tidak memenuhi pelaksanaan pekerjaan atas Quotation',
        description: 'Vendor tidak memenuhi pelaksanaan pekerjaan sesuai Quotation',
        point: 1,
      },
    }),
    prisma.vendor_violation_type.create({
      data: {
        code: 'QUOTATION_LATE_H2',
        category: 'LAINNYA',
        name: 'Quotation terbit > H+2 sejak Survey Selesai',
        description: 'Quotation tidak terbit lebih dari 2 hari sejak Survey Selesai',
        point: 1,
      },
    }),
    prisma.vendor_violation_type.create({
      data: {
        code: 'QUOTATION_LATE_H3',
        category: 'LAINNYA',
        name: 'Quotation terbit > H+3 sejak Survey Selesai',
        description: 'Quotation tidak terbit lebih dari 3 hari sejak Survey Selesai',
        point: 1,
      },
    }),
    prisma.vendor_violation_type.create({
      data: {
        code: 'DOC_NOT_UPLOADED',
        category: 'LAINNYA',
        name: 'Tidak upload dokumentasi foto before/after',
        description: 'Vendor tidak upload dokumentasi foto before/after atau foto blur/tidak lengkap',
        point: 1,
      },
    }),
    prisma.vendor_violation_type.create({
      data: {
        code: 'STATUS_NOT_UPDATED_H',
        category: 'LAINNYA',
        name: 'Tidak update status order pada hari H',
        description: 'Vendor tidak mengupdate status order pada hari H',
        point: 1,
      },
    }),
    prisma.vendor_violation_type.create({
      data: {
        code: 'STATUS_NOT_UPDATED_H1',
        category: 'LAINNYA',
        name: 'Tidak update status order pada H+1',
        description: 'Vendor tidak mengupdate status order pada H+1',
        point: 1,
      },
    }),
    prisma.vendor_violation_type.create({
      data: {
        code: 'STATUS_NOT_UPDATED_H_PLUS',
        category: 'LAINNYA',
        name: 'Tidak update status order pada >H+2',
        description: 'Vendor tidak mengupdate status order lebih dari H+2',
        point: 1,
      },
    }),
  ]);
  console.log(`   ✅ Violation Types: ${violationTypes.length} created`);

  // ============================================
  // 9. VENDOR VIOLATION LOGS & SP
  // ============================================
  console.log('\n📊 Seeding Violation Logs & SP Records...');

  const now = new Date();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
  const currentYear = now.getFullYear();

  // Get violation types for testing
  const vtOrderConfirmed = await prisma.vendor_violation_type.findFirst({ where: { code: 'ORDER_NOT_CONFIRMED_H1' } });
  const vtComplaint = await prisma.vendor_violation_type.findFirst({ where: { code: 'CUSTOMER_COMPLAINT' } });

  // Violation Logs untuk Vendor 2 (SP1 vendor)
  await prisma.vendor_violation_log.createMany({
    data: [
      {
        vendor_id: vendors[1].id,
        violation_type_id: vtOrderConfirmed.id,
        order_id: orders[1].id,
        quarter: currentQuarter,
        year: currentYear,
        description: 'Testing violation log untuk Vendor SP1',
        created_at: new Date(),
      },
      {
        vendor_id: vendors[1].id,
        violation_type_id: vtComplaint.id,
        order_id: orders[1].id,
        quarter: currentQuarter,
        year: currentYear,
        description: 'Komplain customer testing',
        created_at: new Date(),
      },
    ],
  });
  console.log('   ✅ Violation Logs created');

  // SP1 untuk Vendor 2
  const spEndDate = new Date();
  spEndDate.setDate(spEndDate.getDate() + 90); // 90 hari dari sekarang

  const sp1 = await prisma.vendor_sp.create({
    data: {
      vendor_id: vendors[1].id,
      sp_level: 1,
      total_point: 2,
      quarter: currentQuarter,
      year: currentYear,
      start_date: new Date(),
      end_date: spEndDate,
      status: 1, // AKTIF
      allocation_reduction: 50,
      notes: 'SP1 Testing - Vendor ini melanggar SLA',
    },
  });
  console.log(`   ✅ SP1 created for Vendor 2`);

  // SP3 untuk Vendor 3
  const sp3EndDate = new Date();
  sp3EndDate.setDate(sp3EndDate.getDate() + 90);

  await prisma.vendor_sp.create({
    data: {
      vendor_id: vendors[2].id,
      sp_level: 3,
      total_point: 52,
      quarter: currentQuarter,
      year: currentYear,
      start_date: new Date(),
      end_date: sp3EndDate,
      status: 1, // AKTIF
      allocation_reduction: 100,
      notes: 'SP3 Testing - Vendor dinonaktifkan',
    },
  });
  console.log(`   ✅ SP3 created for Vendor 3`);

  // ============================================
  // 10. VENDOR REGISTRATION (PENDING)
  // ============================================
  console.log('\n📝 Seeding Vendor Registrations...');

  const registrations = await Promise.all([
    prisma.vendor_registration.create({
      data: {
        company_name: 'CV. Baru Install',
        address: 'Jl. Pendaftaran 1',
        phone_number: '0811223344',
        email_address: 'registrasi@email.com',
        pic_name: 'Baru Daftar',
        pic_email: 'pic@email.com',
        pic_phone: '0811223344',
        status: 1, // PENDING
      },
    }),
    prisma.vendor_registration.create({
      data: {
        company_name: 'UD. ServiceAC Cepat',
        address: 'Jl. Pendaftaran 2',
        phone_number: '0811223345',
        email_address: 'serviceac@email.com',
        pic_name: 'Servis Baru',
        pic_email: 'servis@email.com',
        pic_phone: '0811223345',
        status: 2, // APPROVED
        reviewed_at: new Date(),
      },
    }),
  ]);
  console.log(`   ✅ Vendor Registrations: ${registrations.length} created`);

  // ============================================
  // 11. WORK ORDERS
  // ============================================
  console.log('\n🔧 Seeding Work Orders...');

  const statusWorkStart = await prisma.status.findFirst({ where: { category: 'WORKSTART' } });
  const statusWorkEnd = await prisma.status.findFirst({ where: { category: 'WORKEND' } });

  const workOrders = await Promise.all([
    prisma.work_orders.create({
      data: {
        order_id: orders[0].id,
        vendor_id: vendors[0].id,
        status_id: statusWorkStart.id,
        survey_date: new Date(),
        work_start_date: new Date(),
      },
    }),
    prisma.work_orders.create({
      data: {
        order_id: orders[1].id,
        vendor_id: vendors[1].id,
        status_id: statusWorkEnd.id,
        survey_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        work_start_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        work_end_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);
  console.log(`   ✅ Work Orders: ${workOrders.length} created`);

  // ============================================
  // 12. REFUNDS (Testing untuk trigger pelanggaran)
  // ============================================
  console.log('\n💰 Seeding Refunds...');

  const refundStatus = await prisma.status.findFirst({ where: { category: 'REFUNDAPPROVED' } });

  const refunds = await prisma.refund.createMany({
    data: [
      {
        order_id: orders[0].id,
        refund_status: refundStatus.id,
        reason: 'Produk tidak sesuai ekspektasi',
        notes: 'Refund karena produk tidak sesuai',
        date_of_filing: new Date(),
        paid_status: 0,
      },
      {
        order_id: orders[1].id,
        refund_status: refundStatus.id,
        reason: 'Double order',
        notes: 'Refund karena double order',
        date_of_filing: new Date(),
        paid_status: 0,
      },
    ],
  });
  console.log(`   ✅ Refunds: ${refunds.count} created`);

  // ============================================
  // 13. COMPLAINTS
  // ============================================
  console.log('\n📞 Seeding Complaints...');

  const complaintStatus = await prisma.status.findFirst({ where: { category: 'COMPLAINTOPEN' } });

  const complaints = await Promise.all([
    prisma.complaints.create({
      data: {
        order_id: orders[0].id,
        complaint_status: complaintStatus.id,
        description: 'Jadwal terlambat',
        type: 1, // Jadwal
        complaint_date: new Date(),
      },
    }),
  ]);
  console.log(`   ✅ Complaints: ${complaints.length} created`);

  // ============================================
  // 14. QUOTATIONS
  // ============================================
  console.log('\n💬 Seeding Quotations...');

  const statusQuoteIn = await prisma.status.findFirst({ where: { category: 'QUOTEIN' } });

  const quotations = await Promise.all([
    prisma.quotation.create({
      data: {
        store_id: stores[0].id,
        order_id: orders[0].id,
        quotation_status: statusQuoteIn.id,
        quotation_number: 'QTN-2024-001',
        quotation_date: new Date(),
        quotation_grand_total: 500000,
        description: 'Quotation testing',
      },
    }),
  ]);
  console.log(`   ✅ Quotations: ${quotations.length} created`);

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(50));
  console.log('✅ DATABASE SEEDING COMPLETED');
  console.log('='.repeat(50));
  console.log(`
Summary:
- Banks: ${banks.length}
- Provinces: ${provinces.length}
- Cities: ${cities.length}
- Areas: ${areas.length}
- Roles: ${roles.length}
- Positions: ${positions.length}
- Service Types: ${serviceTypes.length}
- Categories: ${categories.length}
- Complaint Channels: ${complaintChannels.length}
- Stores: ${stores.length}
- Users: ${users.length}
- Vendors: ${vendors.length}
- Tukangs: ${tukangs.length}
- Members: ${members.length}
- Items: ${items.length}
- Orders: ${orders.length}
- Violation Types: ${violationTypes.length}
- Work Orders: ${workOrders.length}
- Refunds: ${refunds.count}
- Complaints: ${complaints.length}
- Quotations: ${quotations.length}
- Vendor Registrations: ${registrations.length}
  `);

  console.log('\n🎯 Vendor SP Test Data:');
  console.log(`- Vendor 1 (Normal): ID ${vendors[0].id} - Aktif, 0 poin`);
  console.log(`- Vendor 2 (SP1): ID ${vendors[1].id} - Aktif, 2 pelanggaran`);
  console.log(`- Vendor 3 (SP3): ID ${vendors[2].id} - Nonaktif, 52 poin`);

  console.log('\n🔗 Login Credentials untuk Testing:');
  console.log('- Admin HO: admin_ho / admin123');
  console.log('- Vendor Owner: vendor_owner_1 / password123');
  console.log('- Password di-hash dengan bcrypt (default password adalah hash placeholder)');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
