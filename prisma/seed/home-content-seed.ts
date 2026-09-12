import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const DEFAULT_UNIFIED_HOME_PAYLOAD = {
  hero: {
    headline_main: 'Selamat bergabung sebagai',
    headline_highlight: 'Mitra Instalasi Mitra10',
    description:
      'Sambil menunggu verifikasi selesai, kenali dulu bagaimana platform ini membantu Anda mendapatkan order instalasi rutin dari pelanggan Mitra10 di kota Anda.',
    illustration_image: null,
  },
  benefits: [
    {
      icon: '📦',
      title: 'Order Instalasi Rutin',
      description: 'Akses permintaan instalasi dari pelanggan Mitra10 di kota Anda setiap hari.',
      accent_color: 'brand-blue',
    },
    {
      icon: '💰',
      title: 'Quotation Transparan',
      description: 'Ajukan penawaran harga langsung ke pelanggan tanpa potongan tersembunyi.',
      accent_color: 'brand-red',
    },
    {
      icon: '🧾',
      title: 'Pembayaran Terjadwal',
      description: 'Terima pembayaran quotation lewat sistem yang tercatat rapi di menu Invoice.',
      accent_color: 'brand-yellow',
    },
    {
      icon: '🛡️',
      title: 'Perlindungan Kerja',
      description: 'Setiap pengerjaan dapat didampingi opsi asuransi kecelakaan kerja.',
      accent_color: 'brand-blue',
    },
    {
      icon: '⭐',
      title: 'Reputasi Terukur',
      description: 'Bangun rating dari histori pengerjaan yang dilihat calon pelanggan baru.',
      accent_color: 'brand-red',
    },
    {
      icon: '🎓',
      title: 'Pelatihan Berkala',
      description: 'Ikuti sesi pelatihan teknis dan produk terbaru dari tim Mitra10.',
      accent_color: 'brand-yellow',
    },
  ],
  catalogs: [
    {
      name: 'Electrical & Lighting',
      image: null,
      icon_fallback: '💡',
      badge_text: 'Populer',
      link_url: 'https://www.mitra10.com/alat-listrik',
      button_label: 'Lihat Produk →',
      button_style: 'primary',
    },
    {
      name: 'Flooring & Wall',
      image: null,
      icon_fallback: '🧱',
      badge_text: null,
      link_url: 'https://www.mitra10.com/lantai-dinding',
      button_label: 'Lihat Produk →',
      button_style: 'primary',
    },
    {
      name: 'Bath & Kitchen',
      image: null,
      icon_fallback: '🚿',
      badge_text: null,
      link_url: 'https://www.mitra10.com/kamar-mandi-dapur',
      button_label: 'Lihat Produk →',
      button_style: 'primary',
    },
    {
      name: 'Paint & Sundries',
      image: null,
      icon_fallback: '🎨',
      badge_text: null,
      link_url: 'https://www.mitra10.com/cat',
      button_label: 'Lihat Produk →',
      button_style: 'primary',
    },
    {
      name: 'Hardware',
      image: null,
      icon_fallback: '🔒',
      badge_text: null,
      link_url: 'https://www.mitra10.com/sistem-keamanan-rumah',
      button_label: 'Lihat Produk →',
      button_style: 'secondary',
    },
    {
      name: 'Building & Materials',
      image: null,
      icon_fallback: '🏗️',
      badge_text: null,
      link_url: 'https://www.mitra10.com/bahan-bangunan',
      button_label: 'Lihat Produk →',
      button_style: 'secondary',
    },
    {
      name: 'Tools',
      image: null,
      icon_fallback: '🧰',
      badge_text: null,
      link_url: 'https://www.mitra10.com/perkakas',
      button_label: 'Lihat Produk →',
      button_style: 'secondary',
    },
    {
      name: 'Houseware & Hobbies',
      image: null,
      icon_fallback: '🏠',
      badge_text: null,
      link_url: 'https://www.mitra10.com/peralatan-rumah-tangga',
      button_label: 'Lihat Produk →',
      button_style: 'secondary',
    },
  ],
  programs: [
    {
      title: 'Program Promo Cuci AC',
      description: 'Dapatkan insentif ekstra 15% dan voucher belanja kebutuhan instalasi untuk setiap pengerjaan jasa cuci & servis AC berkala di area Jabodetabek.\n\n![Ketentuan Program Promo Cuci AC](storage/home-content/program-cuci-ac.jpg)\n\nProgram berlaku otomatis untuk seluruh mitra instalasi AC bersertifikat Mitra10.',
      badge_label: 'Promo Spesial',
      badge: 'Promo Spesial',
      cta_label: 'Ikuti Program',
      image_url: 'storage/home-content/program-cuci-ac.jpg',
      image: 'storage/home-content/program-cuci-ac.jpg',
      link_url: 'https://www.mitra10.com',
      order_index: 1,
      is_active: true,
    },
    {
      title: 'Program Free Pasangan Water Heater Heatsafe',
      description: 'Program kemitraan bundling unit pemanas air dengan jasa pemasangan gratis bagi konsumen. Komisi teknisi dibayarkan penuh dan dijamin oleh Mitra10.',
      badge_label: 'Program Berjalan',
      badge: 'Program Berjalan',
      cta_label: 'Ikuti Program',
      image_url: 'storage/home-content/program-water-heater.jpg',
      image: 'storage/home-content/program-water-heater.jpg',
      link_url: 'https://www.mitra10.com',
      order_index: 2,
      is_active: true,
    },
  ],
  job_results: [
    {
      title: 'Pemasangan Water Heater & Jalur Pipa Heatsafe',
      description: 'Instalasi water heater listrik kapasitas 30L beserta jalur pipa air panas & dingin berstandar SNI dengan uji tekanan bebas bocor.',
      media_type: 'before_after',
      badge_label: 'Before - After',
      tag: 'Before - After',
      image_before_url: 'storage/home-content/job-before.jpg',
      before_image: 'storage/home-content/job-before.jpg',
      image_after_url: 'storage/home-content/job-after.jpg',
      image: 'storage/home-content/job-after.jpg',
      video_url: null,
      order_index: 1,
      is_active: true,
    },
    {
      title: 'Dokumentasi Video Renovasi Kamar Mandi & Pemasangan Sanitair',
      description: 'Dokumentasi video tahapan instalasi kloset duduk dual-flush, shower box tempered glass, dan uji aliran saluran pembuangan air secara menyeluruh.',
      media_type: 'video',
      badge_label: 'Video Dokumentasi',
      tag: 'Video Dokumentasi',
      image_before_url: null,
      before_image: null,
      image_after_url: null,
      image: null,
      video_url: 'https://www.w3schools.com/html/mov_bbb.mp4',
      order_index: 2,
      is_active: true,
    },
  ],
  support: {
    support_label: 'Hubungi Tim Support',
    support_email: 'vendor-support@mitra10.com',
    support_phone: '+6281234567890',
    support_hours: 'Senin - Jumat, 08:00 - 17:00 WIB',
    support_note: 'Layanan bantuan terintegrasi langsung dengan widget Live Chat Yellow.ai di pojok kanan bawah.',
    yellow_ai_bot_id: 'x1657090256339',
  },
};

export async function HomeContentSeed(forceReset = false) {
  if (forceReset) {
    await prisma.home_content.deleteMany({
      where: { section: 'UNIFIED_HOME' },
    });
  }

  // Check if active UNIFIED_HOME exists
  const existing = await prisma.home_content.findFirst({
    where: { section: 'UNIFIED_HOME', is_active: true },
    orderBy: { id: 'desc' },
  });

  if (existing) {
    let currentPayload: any = {};
    try {
      currentPayload = typeof existing.payload === 'string' ? JSON.parse(existing.payload) : existing.payload;
    } catch {
      currentPayload = {};
    }

    const updatedPayload = {
      hero: currentPayload.hero || DEFAULT_UNIFIED_HOME_PAYLOAD.hero,
      benefits: currentPayload.benefits || DEFAULT_UNIFIED_HOME_PAYLOAD.benefits,
      catalogs: currentPayload.catalogs || DEFAULT_UNIFIED_HOME_PAYLOAD.catalogs,
      programs: DEFAULT_UNIFIED_HOME_PAYLOAD.programs,
      job_results: DEFAULT_UNIFIED_HOME_PAYLOAD.job_results,
      support: currentPayload.support || DEFAULT_UNIFIED_HOME_PAYLOAD.support,
    };

    await prisma.home_content.update({
      where: { id: existing.id },
      data: {
        payload: JSON.stringify(updatedPayload),
        updated_at: new Date(),
      },
    });
    console.log(`[seed] HomeContentSeed: Updated existing active package (ID: ${existing.id}) with programs & job_results.`);
    return;
  }

  // Deactivate any existing
  await prisma.home_content.updateMany({
    data: { is_active: false },
  });

  // Create unified package
  await prisma.home_content.create({
    data: {
      section: 'UNIFIED_HOME',
      title: 'Konten Home Vendor - Versi Utama (Default)',
      payload: JSON.stringify(DEFAULT_UNIFIED_HOME_PAYLOAD),
      order_index: 1,
      is_active: true,
    },
  });
  console.log('[seed] HomeContentSeed: Created new active UNIFIED_HOME package.');
}

if (require.main === module) {
  HomeContentSeed(process.argv.includes('--force'))
    .then(() => {
      console.log('✅ Unified Home Content package seeded successfully (Hero + 6 Benefits + 8 Catalogs + 2 Programs + 2 Job Results + Yellow.ai Support).');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
