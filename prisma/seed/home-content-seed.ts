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
  support: {
    support_label: 'Hubungi Tim Support',
    support_email: 'vendor-support@mitra10.com',
    support_phone: '+6281234567890',
    support_hours: 'Senin - Jumat, 08:00 - 17:00 WIB',
    support_note: 'Tim support kami siap membantu pertanyaan terkait pendaftaran dan instalasi.',
  },
};

export async function HomeContentSeed(forceReset = false) {
  if (forceReset) {
    await prisma.home_content.deleteMany({});
  } else {
    const existing = await prisma.home_content.findFirst({
      where: { section: 'UNIFIED_HOME' },
    });
    if (existing) return;
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
}

if (require.main === module) {
  HomeContentSeed(true)
    .then(() => {
      console.log('✅ Unified Home Content package seeded successfully (Hero + 6 Benefits + 8 Catalogs + Dynamic Support).');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
