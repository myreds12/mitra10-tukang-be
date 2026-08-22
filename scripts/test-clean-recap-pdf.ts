/* eslint-disable prettier/prettier */
/**
 * Test script untuk styling PDF Rekap Vendor Bersih.
 *
 * Generate sample PDF tanpa DB, pakai sample data 32 vendor dengan
 * beberapa nama panjang untuk test line wrapping di kolom Nama Perusahaan.
 *
 * Jalankan dari root mitra10-tukang-api:
 *   npx ts-node scripts/test-clean-recap-pdf.ts
 */
import * as path from 'path';
import * as fs from 'fs';
import { PdfService } from '../src/common/services/pdf.service';

interface SampleVendor {
  id: number;
  company_name: string;
  pic_name: string;
  total_orders: number;
}

// Sample 32 vendor — beberapa nama panjang untuk test line-wrap handling
const SAMPLE_VENDORS: SampleVendor[] = [
  { id: 1, company_name: 'PT MOSLEM PARTNERS INNOVATIVE INDONESIA', pic_name: 'Budi Santoso', total_orders: 12 },
  { id: 2, company_name: 'CV Mitra Konstruksi Jaya Abadi', pic_name: 'Ahmad Wijaya', total_orders: 8 },
  { id: 3, company_name: 'PT Sentosa Jaya Teknik Indonesia', pic_name: 'Dewi Lestari', total_orders: 15 },
  { id: 4, company_name: 'CV Pasifik Teknik Mandiri', pic_name: 'Eko Prabowo', total_orders: 6 },
  { id: 5, company_name: 'PT Garuda Service Elektronik Indonesia', pic_name: 'Fitri Handayani', total_orders: 22 },
  { id: 6, company_name: 'UD Mitra Lantai Keramik', pic_name: 'Gunawan Wibisono', total_orders: 5 },
  { id: 7, company_name: 'PT Surya Dinding Konstruksi', pic_name: 'Hendra Kusuma', total_orders: 11 },
  { id: 8, company_name: 'CV Jaya Plafon Interior', pic_name: 'Indah Permata', total_orders: 7 },
  { id: 9, company_name: 'PT Ac Service Indonesia Jaya', pic_name: 'Joko Santoso', total_orders: 18 },
  { id: 10, company_name: 'CV Reparasi Cepat Tanggap', pic_name: 'Kartini Wijaya', total_orders: 9 },
  { id: 11, company_name: 'PT Mitra AC Sejuk Nusantara', pic_name: 'Lutfi Hakim', total_orders: 14 },
  { id: 12, company_name: 'UD Lantai Marmer Indah', pic_name: 'Maman Supriatna', total_orders: 4 },
  { id: 13, company_name: 'PT Dinding Gypsum Profesional', pic_name: 'Nining Suryani', total_orders: 10 },
  { id: 14, company_name: 'CV Plafon Minimalis Modern', pic_name: 'Oki Setiawan', total_orders: 6 },
  { id: 15, company_name: 'PT Surya Instalasi Listrik', pic_name: 'Putri Ayu', total_orders: 13 },
  { id: 16, company_name: 'UD Cat Tembok Berkualitas', pic_name: 'Rudi Hartono', total_orders: 8 },
  { id: 17, company_name: 'PT Mitra Tukang Profesional Indonesia', pic_name: 'Santi Dewi', total_orders: 16 },
  { id: 18, company_name: 'CV Pipa Ledeng Ahli', pic_name: 'Toni Salim', total_orders: 5 },
  { id: 19, company_name: 'PT Kontraktor Bangunan Sentosa', pic_name: 'Umi Kalsum', total_orders: 19 },
  { id: 20, company_name: 'UD Atap Baja Ringan Murah', pic_name: 'Vina Lestari', total_orders: 7 },
  { id: 21, company_name: 'PT Instalasi Pipa Air Bersih', pic_name: 'Wahyu Pratama', total_orders: 11 },
  { id: 22, company_name: 'CV Keramik Dinding Motif', pic_name: 'Yanti Suryani', total_orders: 4 },
  { id: 23, company_name: 'PT Service Karpet Profesional', pic_name: 'Zaki Ahmad', total_orders: 8 },
  { id: 24, company_name: 'UD Tukang Bangunan Berpengalaman', pic_name: 'Andi Pratama', total_orders: 12 },
  { id: 25, company_name: 'PT Mitra Konstruksi Nusantara', pic_name: 'Bella Safitri', total_orders: 9 },
  { id: 26, company_name: 'CV Pengecatan Rumah Cantik', pic_name: 'Candra Wijaya', total_orders: 6 },
  { id: 27, company_name: 'PT Instalasi Listrik Profesional', pic_name: 'Dani Saputra', total_orders: 13 },
  { id: 28, company_name: 'UD Tukang Cat Spesialis', pic_name: 'Eka Putri', total_orders: 8 },
  { id: 29, company_name: 'PT Mitra Service AC Berkualitas', pic_name: 'Fajar Nugroho', total_orders: 17 },
  { id: 30, company_name: 'CV Renovasi Rumah Minimalis', pic_name: 'Galih Pratama', total_orders: 5 },
  { id: 31, company_name: 'PT Konstruksi Baja Indonesia', pic_name: 'Hesti Wulandari', total_orders: 14 },
  { id: 32, company_name: 'UD Tukang Harian Profesional', pic_name: 'Indra Mahendra', total_orders: 7 },
];

async function main() {
  const pdfService = new PdfService();

  const generatedAt = new Date();
  const doc = pdfService.createDocument(generatedAt);

  const quarter = 2;
  const year = 2026;

  // === Styled Header ===
  pdfService.addStyledHeader(doc, {
    title: 'REKAP VENDOR TANPA PELANGGARAN',
    subtitle: `Periode Q${quarter} ${year}    |    Total vendor bersih: ${SAMPLE_VENDORS.length}`,
    documentNo: `CLEAN-RECAP-Q${quarter}-${year}`,
  });

  // === Info Box ===
  pdfService.addInfoBox(doc, 'Informasi Dokumen', [
    { label: 'Tanggal Generate', value: generatedAt.toISOString().slice(0, 10) },
    { label: 'Quartal', value: `Q${quarter} ${year}` },
    { label: 'Kategori Filter', value: 'Semua kategori' },
    { label: 'Total Vendor Bersih', value: String(SAMPLE_VENDORS.length) },
  ]);

  // === Section Heading + Styled Table ===
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#183383')
    .text('Daftar Vendor Bersih');
  doc.moveDown(0.4);

  const rows = SAMPLE_VENDORS.map((v, i) => ({ no: i + 1, ...v }));

  pdfService.addStyledTable(doc, {
    columns: [
      { key: 'no', label: 'No', width: 30, align: 'center', accessor: (r: any) => String(r.no) },
      { key: 'company_name', label: 'Nama Perusahaan', width: 200, accessor: (r: any) => r.company_name },
      { key: 'pic_name', label: 'PIC', width: 110, accessor: (r: any) => r.pic_name },
      { key: 'total_orders', label: 'Total Order', width: 70, align: 'right', accessor: (r: any) => String(r.total_orders) },
      { key: 'status', label: 'Status', width: 80, align: 'center', accessor: () => 'BERSIH' },
    ],
    rows,
    repeatHeader: true,
  });

  // === Signature Box ===
  pdfService.addSignatureBox(doc, [
    {
      name: '(Admin HO)',
      role: 'Head Office',
      placeholder: 'Tanda tangan & cap',
    },
  ], { position: 'right' });

  // === Save (with footer) ===
  const folder = path.resolve('./storage/test-pdf');
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  const filePath = path.join(folder, 'sample-clean-recap.pdf');
  await pdfService.pipeAndSave(doc, filePath, generatedAt);

  console.log(`✅ Sample PDF generated: ${filePath}`);
  console.log(`   Open it to verify visual styling.`);
}

main().catch((err) => {
  console.error('Test script failed:', err);
  process.exit(1);
});