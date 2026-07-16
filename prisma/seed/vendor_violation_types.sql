-- Seed data untuk jenis-jenis pelanggaran vendor
-- Jalankan setelah prisma db push

-- KATEGORI: KONFIRMASI_ORDER
INSERT INTO vendor_violation_type (code, category, name, description, point, is_active, created_at)
VALUES
('ORDER_NOT_CONFIRMED_H', 'KONFIRMASI_ORDER', 'Orderan tidak terkonfirmasi pada Hari H', 'Vendor tidak mengkonfirmasi order pada tanggal yang dijadwalkan (Hari H)', 1, 1, GETDATE()),
('ORDER_NOT_CONFIRMED_H1', 'KONFIRMASI_ORDER', 'Orderan tidak terkonfirmasi pada H+1', 'Vendor tidak mengkonfirmasi order pada H+1 sejak penjadwalan', 1, 1, GETDATE()),
('ORDER_NOT_CONFIRMED_H_PLUS', 'KONFIRMASI_ORDER', 'Orderan tidak terkonfirmasi pada >H+1', 'Vendor tidak mengkonfirmasi order lebih dari H+1', 1, 1, GETDATE());

-- KATEGORI: RESCHEDULE
INSERT INTO vendor_violation_type (code, category, name, description, point, is_active, created_at)
VALUES
('RESCHEDULE_NOT_UPDATED', 'RESCHEDULE', 'Tidak update status order sejak tanggal reschedule diajukan', 'Vendor tidak mengupdate status order di Aplikasi Tukang sejak tanggal reschedule diajukan', 1, 1, GETDATE()),
('RESCHEDULE_CHANGE_SCHEDULE', 'RESCHEDULE', 'Mengubah jadwal survey/pengerjaan saat hari pelaksanaan', 'Vendor mengubah jadwal survey atau pengerjaan pada hari pelaksanaan', 1, 1, GETDATE());

-- KATEGORI: REFUND
INSERT INTO vendor_violation_type (code, category, name, description, point, is_active, created_at)
VALUES
('REFUND_5_PER_QUARTER', 'REFUND', '5 order refund per quarter', 'Vendor memiliki 5 order refund dalam satu quarter', 1, 1, GETDATE()),
('REFUND_6_10_PER_QUARTER', 'REFUND', '6-10 order refund per quarter', 'Vendor memiliki 6-10 order refund dalam satu quarter', 1, 1, GETDATE());

-- KATEGORI: LAINNYA
INSERT INTO vendor_violation_type (code, category, name, description, point, is_active, created_at)
VALUES
('CUSTOMER_COMPLAINT', 'LAINNYA', 'Komplain customer (jadwal/pengerjaan)', 'Customer mengajukan komplain terkait jadwal atau pengerjaan', 1, 1, GETDATE()),
('QUOTATION_NOT_FULFILLED', 'LAINNYA', 'Tidak memenuhi pelaksanaan pekerjaan atas Quotation yang sudah terbit', 'Vendor tidak memenuhi pelaksanaan pekerjaan sesuai Quotation yang sudah disetujui', 1, 1, GETDATE()),
('QUOTATION_LATE_H2', 'LAINNYA', 'Quotation terbit > H+2 sejak Survey Selesai', 'Quotation tidak terbit lebih dari 2 hari sejak status Survey Selesai', 1, 1, GETDATE()),
('QUOTATION_LATE_H3', 'LAINNYA', 'Quotation terbit > H+3 sejak Survey Selesai', 'Quotation tidak terbit lebih dari 3 hari sejak status Survey Selesai', 1, 1, GETDATE()),
('DOC_NOT_UPLOADED', 'LAINNYA', 'Tidak upload dokumentasi foto before/after', 'Vendor tidak upload dokumentasi foto before/after atau dokumentasi blur/tidak lengkap', 1, 1, GETDATE()),
('STATUS_NOT_UPDATED_H', 'LAINNYA', 'Tidak update status order pada hari H', 'Vendor tidak mengupdate status order pada hari H sejak orderan berjalan', 1, 1, GETDATE()),
('STATUS_NOT_UPDATED_H1', 'LAINNYA', 'Tidak update status order pada H+1', 'Vendor tidak mengupdate status order pada H+1 sejak orderan berjalan', 1, 1, GETDATE()),
('STATUS_NOT_UPDATED_H_PLUS', 'LAINNYA', 'Tidak update status order pada >H+2', 'Vendor tidak mengupdate status order lebih dari H+2 sejak orderan berjalan', 1, 1, GETDATE());
