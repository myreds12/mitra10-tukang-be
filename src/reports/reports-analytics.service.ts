/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ReportsAnalyticsService {
  private readonly logger = new Logger(ReportsAnalyticsService.name);

  constructor(private readonly dbService: PrismaService) {}

private toNumber(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof (value as { toNumber?: () => number }).toNumber === 'function') {
      return (value as { toNumber: () => number }).toNumber();
    }
    return Number(value);
  }

  private toIntOrUndefined(value?: string): number | undefined {
    const num = value == null ? NaN : Number(value);
    return Number.isFinite(num) ? num : undefined;
  }

  private buildReportConditions(
    params: {
      orderYear?: string;
      orderMonth?: string;
      invoiceYear?: string;
      invoiceMonth?: string;
    } = {},
  ): Prisma.Sql {
    const conds: Prisma.Sql[] = [Prisma.sql`o.deleted_at IS NULL`];

    const orderYear = this.toIntOrUndefined(params.orderYear);
    const orderMonth = this.toIntOrUndefined(params.orderMonth);
    if (orderYear) conds.push(Prisma.sql`YEAR(o.created_at) = ${orderYear}`);
    if (orderMonth) conds.push(Prisma.sql`MONTH(o.created_at) = ${orderMonth}`);

    const invYear = this.toIntOrUndefined(params.invoiceYear);
    const invMonth = this.toIntOrUndefined(params.invoiceMonth);
    if (invYear || invMonth) {
      const innerConds: Prisma.Sql[] = [
        Prisma.sql`ind.orderId = o.id AND ind.deletedAt IS NULL`,
      ];
      if (invYear) innerConds.push(Prisma.sql`YEAR(inv.created_at) = ${invYear}`);
      if (invMonth) innerConds.push(Prisma.sql`MONTH(inv.created_at) = ${invMonth}`);
      conds.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM invoice_details ind
        JOIN invoices inv ON inv.id = ind.invoiceId AND inv.deleted_at IS NULL
        WHERE ${Prisma.join(innerConds, ' AND ')}
      )`);
    }

    return Prisma.join(conds, ' AND ');
  }

  async daerahTerlarisReport(
    params: {
      orderYear?: string;
      orderMonth?: string;
      invoiceYear?: string;
      invoiceMonth?: string;
    } = {},
  ) {
    const rows: any[] = await this.dbService.$queryRaw(Prisma.sql`
      SELECT
        COALESCE(a.area, 'Tidak diketahui') AS namaDaerah,
        COUNT(o.id) AS jumlahPengajuan,
        COALESCE(SUM(o.grand_total), 0) AS totalNilaiTransaksi,
        COALESCE(SUM(d.jasa), 0) AS nilaiJasa,
        COALESCE(SUM(d.material), 0) AS nilaiMaterial
      FROM orders o
      LEFT JOIN store s ON s.id = o.store_id AND s.deleted_at IS NULL
      LEFT JOIN area a ON a.id = s.area_id
      LEFT JOIN (
        SELECT
          q.order_id,
          SUM(CASE WHEN qd.item_type = 2 THEN qd.final_price ELSE 0 END) AS jasa,
          SUM(CASE WHEN qd.item_type = 1 THEN qd.final_price ELSE 0 END) AS material
        FROM quotation q
        JOIN quotation_details qd ON qd.quotation_id = q.id AND qd.deleted_at IS NULL
        WHERE q.deleted_at IS NULL
        GROUP BY q.order_id
      ) d ON d.order_id = o.id
      WHERE ${this.buildReportConditions(params)}
      GROUP BY COALESCE(a.area, 'Tidak diketahui')
      ORDER BY jumlahPengajuan DESC
    `);

    const data = rows.map((r) => ({
      namaDaerah: r.namaDaerah,
      jumlahPengajuan: this.toNumber(r.jumlahPengajuan),
      totalNilaiTransaksi: this.toNumber(r.totalNilaiTransaksi),
      nilaiJasa: this.toNumber(r.nilaiJasa),
      nilaiMaterial: this.toNumber(r.nilaiMaterial),
    }));
    return { data, meta: { total: data.length } };
  }

  async tokoJasaInstalasiReport(
    params: {
      orderYear?: string;
      orderMonth?: string;
      invoiceYear?: string;
      invoiceMonth?: string;
    } = {},
  ) {
    const rows: any[] = await this.dbService.$queryRaw(Prisma.sql`
      SELECT
        COALESCE(s.store_name, 'Tidak diketahui') AS namaToko,
        o.payment_type AS jenisLayanan,
        COUNT(o.id) AS jumlahPengajuan,
        COALESCE(SUM(o.grand_total), 0) AS totalNilaiTransaksi,
        COALESCE(SUM(d.jasa), 0) AS nilaiJasa,
        COALESCE(SUM(d.material), 0) AS nilaiMaterial
      FROM orders o
      LEFT JOIN store s ON s.id = o.store_id AND s.deleted_at IS NULL
      LEFT JOIN (
        SELECT
          q.order_id,
          SUM(CASE WHEN qd.item_type = 2 THEN qd.final_price ELSE 0 END) AS jasa,
          SUM(CASE WHEN qd.item_type = 1 THEN qd.final_price ELSE 0 END) AS material
        FROM quotation q
        JOIN quotation_details qd ON qd.quotation_id = q.id AND qd.deleted_at IS NULL
        WHERE q.deleted_at IS NULL
        GROUP BY q.order_id
      ) d ON d.order_id = o.id
      WHERE ${this.buildReportConditions(params)}
      GROUP BY COALESCE(s.store_name, 'Tidak diketahui'), o.payment_type
      ORDER BY namaToko ASC, jumlahPengajuan DESC
    `);

    const data = rows.map((r) => ({
      namaToko: r.namaToko,
      jenisLayanan: r.jenisLayanan,
      jumlahPengajuan: this.toNumber(r.jumlahPengajuan),
      totalNilaiTransaksi: this.toNumber(r.totalNilaiTransaksi),
      nilaiJasa: this.toNumber(r.nilaiJasa),
      nilaiMaterial: this.toNumber(r.nilaiMaterial),
    }));
    return { data, meta: { total: data.length } };
  }

  async exportDaerahTokoExcel(
    res: Response,
    params: {
      orderYear?: string;
      orderMonth?: string;
      invoiceYear?: string;
      invoiceMonth?: string;
    } = {},
  ) {
    const [daerah, toko] = await Promise.all([
      this.daerahTerlarisReport(params),
      this.tokoJasaInstalasiReport(params),
    ]);

    const workbook = new exceljs.Workbook();

    const sheetDaerah = workbook.addWorksheet('Daerah Terlaris');
    sheetDaerah.columns = [
      { header: 'Nama Daerah', key: 'namaDaerah', width: 25 },
      { header: 'Jumlah Pengajuan', key: 'jumlahPengajuan', width: 18 },
      { header: 'Total Nilai Transaksi', key: 'totalNilaiTransaksi', width: 22 },
      { header: 'Nilai Jasa', key: 'nilaiJasa', width: 18 },
      { header: 'Nilai Material', key: 'nilaiMaterial', width: 18 },
    ];
    sheetDaerah.addRows(daerah.data);
    sheetDaerah.getRow(1).font = { bold: true };

    const sheetToko = workbook.addWorksheet('Toko Jasa Instalasi');
    sheetToko.columns = [
      { header: 'Nama Toko', key: 'namaToko', width: 25 },
      { header: 'Jenis Layanan', key: 'jenisLayanan', width: 28 },
      { header: 'Jumlah Pengajuan', key: 'jumlahPengajuan', width: 18 },
      { header: 'Total Nilai Transaksi', key: 'totalNilaiTransaksi', width: 22 },
      { header: 'Nilai Jasa', key: 'nilaiJasa', width: 18 },
      { header: 'Nilai Material', key: 'nilaiMaterial', width: 18 },
    ];
    sheetToko.addRows(toko.data);
    sheetToko.getRow(1).font = { bold: true };

    const now = Date.now();
    const folderPath = './storage/excel/report';
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    const excelFilePath = path.join(folderPath, `report-${now}.xlsx`);

    await workbook.xlsx.writeFile(excelFilePath);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${path.basename(excelFilePath)}`,
    );
    const fileStream = fs.createReadStream(excelFilePath);
    fileStream.pipe(res);
  }

  async orderDetailReport(
    params: {
      orderYear?: string;
      orderMonth?: string;
      invoiceYear?: string;
      invoiceMonth?: string;
    } = {},
  ) {
    const whereSql = this.buildReportConditions(params);

    const orderRows: any[] = await this.dbService.$queryRaw(Prisma.sql`
      SELECT
        o.id AS orderId,
        o.project_number AS projectNumber,
        o.created_at AS orderDate,
        COALESCE(s.store_name, 'Tidak diketahui') AS storeName,
        COALESCE(a.area, 'Tidak diketahui') AS areaName,
        COALESCE(v.company_name, 'Tidak diketahui') AS vendorName,
        invagg.submittedAt AS invoiceSubmittedAt,
        invagg.approvedAt AS invoiceApprovedAt
      FROM orders o
      LEFT JOIN store s ON s.id = o.store_id AND s.deleted_at IS NULL
      LEFT JOIN area a ON a.id = s.area_id
      LEFT JOIN vendor v ON v.id = o.vendor_id AND v.deleted_at IS NULL
      LEFT JOIN (
        SELECT
          ind.orderId AS orderId,
          MIN(inv.created_at) AS submittedAt,
          MIN(il.created_at) AS approvedAt
        FROM invoice_details ind
        JOIN invoices inv ON inv.id = ind.invoiceId AND inv.deleted_at IS NULL
        LEFT JOIN (
          SELECT invoice_id AS invoiceId, MIN(created_at) AS created_at
          FROM invoice_logs
          WHERE ISJSON(TRY_CAST(data AS NVARCHAR(MAX))) = 1
            AND JSON_VALUE(TRY_CAST(data AS NVARCHAR(MAX)), '$.status') = '2'
          GROUP BY invoice_id
        ) il ON il.invoiceId = inv.id
        WHERE ind.deletedAt IS NULL
        GROUP BY ind.orderId
      ) invagg ON invagg.orderId = o.id
      WHERE ${whereSql}
      ORDER BY o.id ASC
    `);

    const invoiceNumberRows: any[] = await this.dbService.$queryRaw(Prisma.sql`
      SELECT
        ind.orderId AS orderId,
        inv.invoice_number AS invoiceNumber
      FROM invoice_details ind
      JOIN invoices inv ON inv.id = ind.invoiceId AND inv.deleted_at IS NULL
      WHERE ind.deletedAt IS NULL
      ORDER BY ind.orderId ASC, inv.id ASC
    `);

    const materialRows: any[] = await this.dbService.$queryRaw(Prisma.sql`
      SELECT
        mod.order_id AS orderId,
        o.created_at AS orderDate,
        mod.item_name AS namaMaterial,
        mod.quantity AS quantity,
        mod.unit_price AS unitPrice,
        mod.total AS total,
        mod.created_at AS tanggalDitambahkan,
        mod.item_notes AS catatan
      FROM m_order_details mod
      JOIN orders o ON o.id = mod.order_id AND o.deleted_at IS NULL
      WHERE ${whereSql}
        AND mod.deleted_at IS NULL
      ORDER BY mod.order_id ASC, mod.created_at ASC
    `);

    const complaintRows: any[] = await this.dbService.$queryRaw(Prisma.sql`
      SELECT
        c.order_id AS orderId,
        c.complaint_date AS tanggalPengaduan,
        c.type AS kategori,
        st.description AS status,
        c.description AS deskripsi
      FROM complaints c
      JOIN orders o ON o.id = c.order_id AND o.deleted_at IS NULL
      LEFT JOIN status st ON st.id = c.complaint_status
      WHERE ${whereSql}
        AND c.deleted_at IS NULL
      ORDER BY c.order_id ASC, c.complaint_date ASC
    `);

    const invoiceNumbersByOrder = new Map<number, string[]>();
    for (const r of invoiceNumberRows) {
      const list = invoiceNumbersByOrder.get(r.orderId) ?? [];
      list.push(r.invoiceNumber);
      invoiceNumbersByOrder.set(r.orderId, list);
    }

    const materialsByOrder = new Map<number, any[]>();
    for (const r of materialRows) {
      const addedAt = new Date(r.tanggalDitambahkan);
      if (addedAt.getTime() > new Date(r.orderDate).getTime()) {
        const list = materialsByOrder.get(r.orderId) ?? [];
        list.push({
          namaMaterial: r.namaMaterial,
          quantity: Number(r.quantity),
          unitPrice: this.toNumber(r.unitPrice),
          total: this.toNumber(r.total),
          tanggalDitambahkan: r.tanggalDitambahkan,
          catatan: r.catatan,
        });
        materialsByOrder.set(r.orderId, list);
      }
    }

    const complaintsByOrder = new Map<number, any[]>();
    for (const r of complaintRows) {
      const list = complaintsByOrder.get(r.orderId) ?? [];
      list.push({
        tanggalPengaduan: r.tanggalPengaduan,
        kategori: r.kategori === 1 ? 'COMPLAINT' : 'PRIORITAS_LAIN',
        status: r.status,
        deskripsi: r.deskripsi,
      });
      complaintsByOrder.set(r.orderId, list);
    }

    const data = orderRows.map((r) => {
      const orderDate = r.orderDate ? new Date(r.orderDate) : null;
      const submitted = r.invoiceSubmittedAt ? new Date(r.invoiceSubmittedAt) : null;
      const approved = r.invoiceApprovedAt ? new Date(r.invoiceApprovedAt) : null;
      const durasiProses =
        submitted && approved
          ? Math.max(0, Math.round((approved.getTime() - submitted.getTime()) / 86400000))
          : null;
      return {
        orderId: r.orderId,
        projectNumber: r.projectNumber,
        orderDate,
        storeName: r.storeName,
        areaName: r.areaName,
        vendorName: r.vendorName,
        invoiceNumber: invoiceNumbersByOrder.get(r.orderId)?.join(', ') || null,
        invoiceSubmittedAt: submitted,
        invoiceApprovedAt: approved,
        durasiProses,
        penambahanMaterial: materialsByOrder.get(r.orderId) ?? [],
        pengaduan: complaintsByOrder.get(r.orderId) ?? [],
      };
    });

    return { data, meta: { total: data.length } };
  }

  async exportOrderDetailExcel(
    res: Response,
    params: {
      orderYear?: string;
      orderMonth?: string;
      invoiceYear?: string;
      invoiceMonth?: string;
    } = {},
  ) {
    const report = await this.orderDetailReport(params);
    const workbook = new exceljs.Workbook();

    const sheetDetail = workbook.addWorksheet('Detail Order');
    sheetDetail.columns = [
      { header: 'Order ID', key: 'orderId', width: 10 },
      { header: 'Project Number', key: 'projectNumber', width: 22 },
      { header: 'Tahun Order', key: 'orderYear', width: 12 },
      { header: 'Tgl Order', key: 'orderDate', width: 20 },
      { header: 'Toko', key: 'storeName', width: 28 },
      { header: 'Area', key: 'areaName', width: 20 },
      { header: 'Vendor', key: 'vendorName', width: 28 },
      { header: 'No Invoice', key: 'invoiceNumber', width: 24 },
      { header: 'Tahun Invoice', key: 'invoiceYear', width: 14 },
      { header: 'Tgl Pengajuan Invoice', key: 'invoiceSubmittedAt', width: 22 },
      { header: 'Tgl Disetujui', key: 'invoiceApprovedAt', width: 22 },
      { header: 'Durasi Proses (hari)', key: 'durasiProses', width: 18 },
    ];
    const detailRows = report.data.map((r: any) => ({
      ...r,
      orderYear: r.orderDate ? new Date(r.orderDate).getFullYear() : null,
      orderDate: r.orderDate,
      invoiceYear: r.invoiceSubmittedAt
        ? new Date(r.invoiceSubmittedAt).getFullYear()
        : null,
    }));
    sheetDetail.addRows(detailRows);
    sheetDetail.getRow(1).font = { bold: true };

    const sheetMaterial = workbook.addWorksheet('Penambahan Material');
    sheetMaterial.columns = [
      { header: 'Order ID', key: 'orderId', width: 10 },
      { header: 'Project Number', key: 'projectNumber', width: 22 },
      { header: 'Tahun', key: 'tahun', width: 10 },
      { header: 'Nama Material', key: 'namaMaterial', width: 28 },
      { header: 'Qty', key: 'nominalQuantity', width: 10 },
      { header: 'Harga Satuan', key: 'unitPrice', width: 16 },
      { header: 'Total', key: 'total', width: 16 },
      { header: 'Tgl Ditambahkan', key: 'tanggalDitambahkan', width: 22 },
      { header: 'Catatan', key: 'catatan', width: 30 },
    ];
    const materialRows: any[] = [];
    for (const order of report.data) {
      for (const m of order.penambahanMaterial) {
        materialRows.push({
          orderId: order.orderId,
          projectNumber: order.projectNumber,
          tahun: m.tanggalDitambahkan
            ? new Date(m.tanggalDitambahkan).getFullYear()
            : null,
          ...m,
        });
      }
    }
    sheetMaterial.addRows(materialRows);
    sheetMaterial.getRow(1).font = { bold: true };

    const sheetPengaduan = workbook.addWorksheet('Pengaduan');
    sheetPengaduan.columns = [
      { header: 'Order ID', key: 'orderId', width: 10 },
      { header: 'Project Number', key: 'projectNumber', width: 22 },
      { header: 'Tahun', key: 'tahun', width: 10 },
      { header: 'Tgl Pengaduan', key: 'tanggalPengaduan', width: 22 },
      { header: 'Kategori', key: 'kategori', width: 18 },
      { header: 'Status', key: 'status', width: 24 },
      { header: 'Deskripsi', key: 'deskripsi', width: 40 },
    ];
    const complaintRows: any[] = [];
    for (const order of report.data) {
      for (const c of order.pengaduan) {
        complaintRows.push({
          orderId: order.orderId,
          projectNumber: order.projectNumber,
          tahun: c.tanggalPengaduan
            ? new Date(c.tanggalPengaduan).getFullYear()
            : null,
          ...c,
        });
      }
    }
    sheetPengaduan.addRows(complaintRows);
    sheetPengaduan.getRow(1).font = { bold: true };

    const now = Date.now();
    const folderPath = './storage/excel/report';
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    const excelFilePath = path.join(folderPath, `order-detail-${now}.xlsx`);

    await workbook.xlsx.writeFile(excelFilePath);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${path.basename(excelFilePath)}`,
    );
    const fileStream = fs.createReadStream(excelFilePath);
    fileStream.pipe(res);
  }
}
