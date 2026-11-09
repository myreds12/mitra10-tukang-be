import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SqlExecutionResult {
  success: boolean;
  sql: string;
  rows?: any[];
  rowCount?: number;
  error?: string;
}

const FORBIDDEN_SQL_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|EXEC|EXECUTE|CREATE|MERGE|GRANT|REVOKE|DENY|RENAME|BACKUP|RESTORE|SHUTDOWN)\b/i;

const SENSITIVE_COLUMN_PATTERNS = /\b(password|forget_password|token|remember_token)\b/i;

@Injectable()
export class AiSqlExecutorService {
  private readonly logger = new Logger(AiSqlExecutorService.name);

  constructor(private readonly prisma: PrismaService) {}

  getDatabaseSchemaPrompt(): string {
    return [
      'DATABASE CONTEXT (Microsoft SQL Server / T-SQL):',
      'Tanggal saat ini: ' + new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB.',
      '',
      '=== SKEMA TABEL & KOLOM OPERASIONAL LENGKAP (VERIFIKASI DATABASE AKTUAL) ===',
      '- orders: id, project_number, receipt_number, member_id, store_id, vendor_id, sales_id, project_status_id, project_address, payment_type, grand_total, grand_total_comission, notes, request_survey, request_work, created_at, updated_at, deleted_at',
      '- members: id, member_number, full_name, email, phone_number, whatsapp_number, address_1, address_2, zip_code, rating, join_date, join_location, area_id, created_at, updated_at, deleted_at (CATATAN: Pelanggan/Customer ada di tabel "members", kolom nama adalah "full_name")',
      '- store: id, store_name, address, additional_address, zip_code, email, phone_number_1, phone_number_2, area_id, store_group_id, created_at, updated_at, deleted_at (CATATAN: Tabel "store" singular, nama toko adalah "store_name")',
      '- vendor: id, company_name, pic_name, address, phone_number, email_address, ktp_number, npwp_number, is_active, max_order, join_date, created_at, updated_at, deleted_at (CATATAN: Tabel "vendor" singular, nama perusahaan/vendor adalah "company_name")',
      '- tukang: id, vendor_id, user_id, full_name, address, phone_number, email, ktp_number, bod, join_date, is_active, created_at, updated_at, deleted_at (CATATAN: Nama tukang adalah "full_name")',
      '- sales: id, store_id, user_id, full_name, nik, phone_number, sales_brand, order_total, is_active, created_at, updated_at, deleted_at (CATATAN: Nama sales adalah "full_name")',
      '- status: id, category, description, status_urgency, created_at, updated_at',
      '- quotation: id, store_id, order_id, promotion_id, quotation_status, quotation_number, quotation_date, quotation_validity, quotation_disc, quotation_promotion, quotation_grand_total, quotation_no_promotion, description, receipt_quotation, created_at, updated_at, deleted_at',
      '- quotation_details: id, quotation_id, item_id, work_order_items_id, category_id, name, price, margin, final_price, quantity, unit, description, created_at, updated_at, deleted_at',
      '- work_orders: id, order_id, vendor_id, status_id, session, survey_date, work_start_date, work_end_date, request_work_time, created_at, updated_at, deleted_at',
      '- work_order_tukang: id, work_order_id, tukang_id, type (1=survey, 2=pengerjaan), notes, created_at, updated_at, deleted_at',
      '- complaints: id, order_id, complaint_channel, complaint_status, pic_name, type (1=complaint), crm_type, description, complaint_date, complaint_received_date, feedback_name, feedback_role, created_at, updated_at, deleted_at',
      '- remedials: id, complaint_id, remedial_pic, remedial_action, ra_date_start, ra_date_end, remedial_pic_positon, remedial_status, created_at, updated_at, deleted_at',
      '- invoices: id, vendorId, status (1=INVOICE CHECK, 2=APPROVE, 3=REJECTED, 4=WAITING FOR DOCUMENT, 5=INVOICE GIVEN TO FINANCE, 6=INVOICE PAID), total_amount, pkp_nominal, pph_nominal, penalty_nominal, ppn_nominal, invoice_number, invoice_to_finance_date, description, notes, created_at, updated_at, deleted_at (PERHATIKAN: Kolom vendor di SQL Server adalah "vendorId" camelCase; total tagihan adalah "total_amount")',
      '- invoice_details: id, invoiceId, orderId, total, invoice_number, type (1=survey, 2=pengerjaan), createdAt, updatedAt, deletedAt (PERHATIKAN: Kolom di SQL Server adalah "invoiceId" dan "orderId" camelCase)',
      '- reschedule: id, order_id, status_id, reschedule_date, confirm_date, created_at, updated_at, deleted_at',
      '- reschedule_status: id, reschedule_id, status_id, description, status_by, created_at, updated_at, deleted_at (CATATAN: Alasan order di-reschedule ada di kolom "description")',
      '- reschedule_tukang: id, reschedule_id, tukang_id, created_at, updated_at, deleted_at',
      '- refund: id, order_id, refund_status, paid_status (0=unpaid, 1=paid), notes, reason, voucher, penalty_nominal, approval_number, date_approve, date_of_filing, created_at, updated_at, deleted_at',
      '- vendor_violation_log: id, vendor_id, violation_type_id, order_id, quarter, year, description, evidence_path, adjusted_point, revision_note, is_active, created_at, updated_at, deleted_at',
      '- vendor_violation_type: id, code, category, name, description, point, is_active, created_at, updated_at, deleted_at (CATATAN: Poin pelanggaran efektif dihitung dengan COALESCE(vvl.adjusted_point, vvt.point, 0))',
      '- vendor_sp: id, vendor_id, sp_level (1=SP1, 2=SP2, 3=SP3), total_point, quarter, year, start_date, end_date, status (1=AKTIF, 2=SELESAI, 3=EXTENDED), notes, allocation_reduction, created_at, updated_at, deleted_at',
      '- vendor_sp_detail: id, vendor_sp_id, violation_log_id, created_at',
      '- m_order_details: id, order_id, item_id, sales_id, item_code, item_name, unit_price, quantity, total, comission, created_at, updated_at, deleted_at',
      '- items: id, item_name, item_code, service_name, default_price, category_id, is_active, created_at, updated_at, deleted_at',
      '- service_type: id, service_type, is_active, created_at, updated_at, deleted_at',
      '- csi_answers: id, csi_template_id, data, created_at, updated_at, deleted_at',
      '- csi_template: id, name, active, survey_link, spreadsheets_link, created_at, updated_at, deleted_at',
      '',
      '=== PETA RELASI & ATURAN JOIN (SANGAT KRITIS & WAJIB DIIKUTI) ===',
      '1. Relasi Sentral tabel "orders":',
      '   - orders.member_id = members.id (Pelanggan/Customer; nama: members.full_name)',
      '   - orders.store_id  = store.id   (Toko Mitra10; nama toko: store.store_name)',
      '   - orders.vendor_id = vendor.id  (Vendor pelaksana; nama vendor: vendor.company_name)',
      '   - orders.sales_id  = sales.id   (Sales toko; nama sales: sales.full_name)',
      '',
      '2. Relasi "quotation":',
      '   - quotation.order_id = orders.id',
      '   - quotation.store_id = store.id',
      '   * PERINGATAN KERAS: quotation TIDAK memiliki kolom vendor_id atau member_id!',
      '   * Hubungkan quotation ke VENDOR: JOIN orders ON quotation.order_id = orders.id JOIN vendor ON orders.vendor_id = vendor.id',
      '   * Hubungkan quotation ke PELANGGAN: JOIN orders ON quotation.order_id = orders.id JOIN members ON orders.member_id = members.id',
      '',
      '3. Relasi "work_orders" & "work_order_tukang" & "tukang":',
      '   - work_orders.order_id = orders.id',
      '   - work_orders.vendor_id = vendor.id',
      '   - work_order_tukang.work_order_id = work_orders.id',
      '   - work_order_tukang.tukang_id = tukang.id (Nama tukang: tukang.full_name)',
      '   - tukang.vendor_id = vendor.id',
      '   * PERINGATAN KERAS: work_order_tukang TIDAK punya store_id atau member_id!',
      '   * Hubungkan penugasan tukang ke Toko/Order: JOIN work_orders ON work_order_tukang.work_order_id = work_orders.id JOIN orders ON work_orders.order_id = orders.id JOIN store ON orders.store_id = store.id',
      '',
      '4. Relasi Komplain ("complaints") & "remedials":',
      '   - complaints.order_id = orders.id',
      '   - remedials.complaint_id = complaints.id',
      '   * Hubungkan komplain ke TOKO: JOIN orders ON complaints.order_id = orders.id JOIN store ON orders.store_id = store.id',
      '   * Hubungkan komplain ke PELANGGAN: JOIN orders ON complaints.order_id = orders.id JOIN members ON orders.member_id = members.id',
      '   * Hubungkan komplain ke VENDOR: JOIN orders ON complaints.order_id = orders.id JOIN vendor ON orders.vendor_id = vendor.id',
      '',
      '5. Relasi Tagihan Vendor ("invoices" & "invoice_details"):',
      '   - invoices.vendorId = vendor.id (PERHATIAN: nama kolom foreign key adalah "vendorId", bukan vendor_id)',
      '   - invoice_details.invoiceId = invoices.id',
      '   - invoice_details.orderId = orders.id',
      '   * Total tagihan vendor adalah kolom: invoices.total_amount',
      '   * Status invoice: 2 = APPROVE, 6 = INVOICE PAID (lunas)',
      '',
      '6. Relasi Penjadwalan Ulang ("reschedule" & "reschedule_status"):',
      '   - reschedule.order_id = orders.id',
      '   - reschedule_status.reschedule_id = reschedule.id (Alasan reschedule ada di: reschedule_status.description)',
      '   - reschedule_tukang.reschedule_id = reschedule.id',
      '   - reschedule_tukang.tukang_id = tukang.id',
      '',
      '7. Relasi Pengembalian Dana ("refund"):',
      '   - refund.order_id = orders.id (Alasan refund: refund.reason; status bayar: refund.paid_status)',
      '',
      '8. Relasi Pelanggaran & SP Vendor ("vendor_violation_log", "vendor_sp", "vendor_violation_type"):',
      '   - vendor_violation_log.vendor_id = vendor.id',
      '   - vendor_violation_log.violation_type_id = vendor_violation_type.id',
      '   - vendor_violation_log.order_id = orders.id',
      '   - vendor_sp.vendor_id = vendor.id',
      '   - vendor_sp_detail.vendor_sp_id = vendor_sp.id',
      '   - vendor_sp_detail.violation_log_id = vendor_violation_log.id',
      '   * Akumulasi poin pelanggaran: SUM(COALESCE(vvl.adjusted_point, vvt.point, 0))',
      '',
      'ATURAN PEMBUATAN QUERY T-SQL:',
      '1. Gunakan HANYA sintaks SELECT (T-SQL / Microsoft SQL Server).',
      '2. HANYA gunakan nama kolom yang benar-benar tercantum di skema di atas.',
      '3. Selalu sertakan deleted_at IS NULL untuk tabel yang memiliki kolom deleted_at.',
      '4. Exclude data uji coba pada nama perusahaan/toko/sales/member: sertakan NOT LIKE \'%TEST%\' dan NOT LIKE \'%DUMMY%\' dan NOT LIKE \'%SP_ORDER%\'.',
      '5. Gunakan TOP 100 bila tidak ada batasan eksplisit dari pengguna.',
      '6. Bungkus query SQL di dalam tag <sql>SELECT ...</sql>.',
      '7. DILARANG menanyakan detail skema kolom atau relasi kepada pengguna. Anda adalah AI cerdas yang memahami seluruh skema database Mitra10 Tukang.',
      '8. Jika pertanyaan pengguna adalah sapaan santai ("halo", "tes", "terima kasih"), jawab langsung tanpa tag <sql>.',
    ].join('\n');
  }

  cleanAndValidateSql(rawQuery: string): { valid: boolean; cleanSql: string; error?: string } {
    let sql = String(rawQuery || '').trim();
    sql = sql.replace(/^```(?:sql)?/i, '').replace(/```$/i, '').trim();

    // Auto-fix query yang diawali dengan TOP tanpa SELECT
    if (/^\s*TOP\s+\d+/i.test(sql)) {
      sql = 'SELECT ' + sql;
    }

    if (!sql) {
      return { valid: false, cleanSql: '', error: 'Query SQL kosong.' };
    }

    if (!/^\s*(SELECT|WITH)\b/i.test(sql)) {
      return {
        valid: false,
        cleanSql: sql,
        error: 'Query ditolak: Hanya perintah SELECT (read-only) yang diizinkan.',
      };
    }

    if (FORBIDDEN_SQL_KEYWORDS.test(sql)) {
      return {
        valid: false,
        cleanSql: sql,
        error: 'Query ditolak: Mengandung kata kunci DDL/DML atau eksekusi yang dilarang.',
      };
    }

    if (SENSITIVE_COLUMN_PATTERNS.test(sql)) {
      return {
        valid: false,
        cleanSql: sql,
        error: 'Query ditolak: Tidak boleh mengakses kolom kredensial/sensitif.',
      };
    }

    // 1. Strip schema prefixes seperti dbo., mitra10., dsb.
    sql = sql.replace(/\b(?:dbo|mitra10|mitra10_tukang)\./gi, '');

    // 2. Normalisasi nama tabel jamak / alias umum ke nama tabel database sebenarnya
    sql = sql.replace(/\bFROM\s+stores\b/gi, 'FROM store');
    sql = sql.replace(/\bJOIN\s+stores\b/gi, 'JOIN store');
    sql = sql.replace(/\bFROM\s+vendors\b/gi, 'FROM vendor');
    sql = sql.replace(/\bJOIN\s+vendors\b/gi, 'JOIN vendor');
    sql = sql.replace(/\bFROM\s+customers\b/gi, 'FROM members');
    sql = sql.replace(/\bJOIN\s+customers\b/gi, 'JOIN members');
    sql = sql.replace(/\bFROM\s+quotations\b/gi, 'FROM quotation');
    sql = sql.replace(/\bJOIN\s+quotations\b/gi, 'JOIN quotation');
    sql = sql.replace(/\bFROM\s+invoice_vendor\b/gi, 'FROM invoices');
    sql = sql.replace(/\bJOIN\s+invoice_vendor\b/gi, 'JOIN invoices');
    sql = sql.replace(/\bFROM\s+vendor_violations\b/gi, 'FROM vendor_violation_log');
    sql = sql.replace(/\bJOIN\s+vendor_violations\b/gi, 'JOIN vendor_violation_log');

    // 3. Normalisasi kolom camelCase database SQL Server HANYA untuk invoices & invoice_details
    sql = sql.replace(/\b(invoices?\.)vendor_id\b/gi, '$1vendorId');
    sql = sql.replace(/\b(invoices?\.)id_vendor\b/gi, '$1vendorId');
    sql = sql.replace(/\b(i\.)vendor_id\b/gi, '$1vendorId');
    sql = sql.replace(/\b(i\.)id_vendor\b/gi, '$1vendorId');
    sql = sql.replace(/\b(inv\.)vendor_id\b/gi, '$1vendorId');
    sql = sql.replace(/\b(invoice_details?\.)invoice_id\b/gi, '$1invoiceId');
    sql = sql.replace(/\b(invoice_details?\.)order_id\b/gi, '$1orderId');
    sql = sql.replace(/\b(idt\.)invoice_id\b/gi, '$1invoiceId');
    sql = sql.replace(/\b(idt\.)order_id\b/gi, '$1orderId');
    sql = sql.replace(/\b(id\.)invoice_id\b/gi, '$1invoiceId');
    sql = sql.replace(/\b(id\.)order_id\b/gi, '$1orderId');

    // 4. Normalisasi kolom amount pada invoices
    sql = sql.replace(/\bi\.amount\b/gi, 'i.total_amount');
    sql = sql.replace(/\binvoices\.amount\b/gi, 'invoices.total_amount');

    // 5. Normalisasi nama entitas untuk alias tabel umum
    // vendor -> company_name
    sql = sql.replace(/\bv\.vendor_name\b/gi, 'v.company_name');
    sql = sql.replace(/\bv\.name\b/gi, 'v.company_name');
    sql = sql.replace(/\bvendor\.name\b/gi, 'vendor.company_name');
    sql = sql.replace(/\bvendor\.vendor_name\b/gi, 'vendor.company_name');

    // store -> store_name
    sql = sql.replace(/\bs\.name\b/gi, 's.store_name');
    sql = sql.replace(/\bstore\.name\b/gi, 'store.store_name');

    // members -> full_name
    sql = sql.replace(/\bm\.name\b/gi, 'm.full_name');
    sql = sql.replace(/\bmembers\.name\b/gi, 'members.full_name');

    // tukang -> full_name
    sql = sql.replace(/\bt\.name\b/gi, 't.full_name');
    sql = sql.replace(/\btukang\.name\b/gi, 'tukang.full_name');

    // sales -> full_name
    sql = sql.replace(/\bsales\.name\b/gi, 'sales.full_name');

    // reschedule_status -> description
    sql = sql.replace(/\brs\.name\b/gi, 'rs.description');

    // 6. Normalisasi komparasi string kosong pada kolom bertipe TEXT (SQL Server text vs varchar)
    sql = sql.replace(/\b([a-zA-Z0-9_]+\.description)\s*(!=|<>\s*)''/gi, 'LEN(CAST($1 AS VARCHAR(MAX))) > 0');
    sql = sql.replace(/\b([a-zA-Z0-9_]+\.description)\s*=\s*''/gi, 'LEN(CAST($1 AS VARCHAR(MAX))) = 0');

    // Enforce TOP limit if not present
    if (/^\s*SELECT\b/i.test(sql) && !/^\s*SELECT\s+(DISTINCT\s+)?TOP\b/i.test(sql) && !/\bOFFSET\s+\d+\s+ROWS\b/i.test(sql)) {
      sql = sql.replace(/^(\s*SELECT\s+(?:DISTINCT\s+)?)/i, '$1TOP 100 ');
    }

    return { valid: true, cleanSql: sql };
  }

  async executeReadOnlySql(rawQuery: string): Promise<SqlExecutionResult> {
    const check = this.cleanAndValidateSql(rawQuery);
    if (!check.valid) {
      this.logger.warn(`Validasi SQL gagal: ${check.error} -> Query: ${rawQuery}`);
      return {
        success: false,
        sql: rawQuery,
        error: check.error,
      };
    }

    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(check.cleanSql);
      const sanitizedRows = rows.map((row) => {
        const cleanRow: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === 'bigint') {
            cleanRow[k] = Number(v);
          } else if (v && typeof v === 'object' && typeof (v as any).toNumber === 'function') {
            cleanRow[k] = (v as any).toNumber();
          } else if (v instanceof Date) {
            cleanRow[k] = v.toISOString();
          } else {
            cleanRow[k] = v;
          }
        }
        return cleanRow;
      });

      return {
        success: true,
        sql: check.cleanSql,
        rows: sanitizedRows,
        rowCount: sanitizedRows.length,
      };
    } catch (err: any) {
      this.logger.warn(`Eksekusi SQL gagal (${err?.message}) -> Query: ${check.cleanSql}`);
      return {
        success: false,
        sql: check.cleanSql,
        error: err?.message || 'Gagal menjalankan query pada database.',
      };
    }
  }
}
