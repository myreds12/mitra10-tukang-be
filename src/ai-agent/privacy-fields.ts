export const datasets = {
  "orders": {
    "desc": "Satu baris per order layanan (survei/pemasangan) dari toko Mitra10, tidak termasuk order yang dihapus.",
    "fields": {
      "order_id": "id order",
      "tanggal_order": "tanggal order dibuat (YYYY-MM-DD)",
      "bulan": "YYYY-MM dari tanggal_order",
      "kuartal": "YYYY-Qn",
      "tahun": "YYYY",
      "store": "nama toko Mitra10",
      "area": "area/wilayah toko",
      "vendor": "perusahaan vendor pemasangan",
      "jenis": "Survei | Pemasangan tanpa survei | Gratis",
      "kategori": "kategori produk dari item order (bisa gabungan, mis. 'BATHROOM, PLUMBING')",
      "status": "status order terakhir",
      "status_grup": "Selesai | Batal/Refund | Menunggu bayar quotation | Dalam proses",
      "grand_total": "nilai order (Rp)",
      "additional_fee": "biaya tambahan (Rp)",
      "nilai_item": "total nilai item order (Rp)",
      "jml_item": "jumlah kuantitas item",
      "quotation_total": "nilai quotation terakhir (Rp), null bila tidak ada quotation",
      "quotation_status": "status quotation terakhir (mis. 'Quotation Sudah Dibayar', 'Belum dibayar')",
      "nilai_invoice_vendor": "total nilai invoice vendor untuk order ini (Rp)",
      "tgl_mulai": "tanggal mulai kerja (work order)",
      "tgl_selesai": "tanggal selesai kerja",
      "durasi_kerja_hari": "selisih hari mulai–selesai kerja",
      "umur_hari": "umur order dalam hari",
      "jml_komplain": "jumlah komplain",
      "ada_komplain": "true/false",
      "refund": "true/false ada pengajuan refund"
    }
  },
  "invoices": {
    "desc": "Satu baris per invoice vendor (penagihan vendor ke Mitra10).",
    "fields": {
      "invoice_id": "id",
      "invoice_number": "nomor invoice",
      "tanggal": "tanggal invoice dibuat",
      "bulan": "YYYY-MM",
      "kuartal": "YYYY-Qn",
      "tahun": "YYYY",
      "vendor": "perusahaan vendor",
      "status": "kode status invoice ('Status 1'..'Status 6'; arti kode tidak tercatat di database)",
      "total_amount": "nilai invoice (Rp)",
      "ppn_nominal": "PPN (Rp)",
      "pph_nominal": "PPh (Rp)",
      "penalty_nominal": "denda (Rp)",
      "jml_order": "jumlah order dalam invoice"
    }
  },
  "complaints": {
    "desc": "Satu baris per komplain pelanggan.",
    "fields": {
      "komplain_id": "id",
      "order_id": "id order",
      "tanggal": "tanggal komplain",
      "bulan": "YYYY-MM",
      "tahun": "YYYY",
      "status": "status komplain (mis. 'Approved by HO', 'Rejected by HO')",
      "kanal": "kanal komplain ('Kanal 1'.. ; arti kode tidak tercatat)",
      "store": "toko dari order",
      "vendor": "vendor dari order",
      "kategori": "kategori dari order"
    }
  },
  "csi": {
    "desc": "Satu baris per jawaban survei CSI; hanya ringkasan jumlah dan nama template yang digunakan.",
    "fields": {
      "tanggal": "tanggal jawaban diterima",
      "bulan": "YYYY-MM dari tanggal jawaban",
      "tahun": "tahun jawaban",
      "jumlah_jawaban": "jumlah jawaban survei",
      "template": "nama template survei"
    }
  }
};
