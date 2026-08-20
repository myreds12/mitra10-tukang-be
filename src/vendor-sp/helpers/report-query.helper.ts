import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Helper query reusable untuk Poin 3 (Penalty Receipt PDF) + Poin 4
 * (No Violation Certificate PDF). Konsolidasi di satu tempat agar service
 * Poin3/Poin4 tidak duplikasi query.
 *
 * Penggunaan:
 *   const report = new ReportQueryHelper(prisma);
 *   const total = await report.countVendorOrdersInQuarter(vendorId, 1, 2026);
 */
@Injectable()
export class ReportQueryHelper {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Total SEMUA order vendor di kuartal tsb (dasar Poin 4: vendor tanpa
   * pelanggaran tetap dihitung order total-nya). Pakai range created_at
   * karena tabel orders tidak punya kolom quarter/year langsung.
   */
  async countVendorOrdersInQuarter(
    vendorId: number,
    quarter: number,
    year: number,
  ): Promise<number> {
    const { start, end } = this.getQuarterRange(quarter, year);
    return this.prisma.orders.count({
      where: {
        vendor_id: vendorId,
        created_at: { gte: start, lte: end },
        deleted_at: null,
      },
    });
  }

  /**
   * List violation log di kuartal tsb dengan join ke violation_type dan orders.
   * Untuk Poin 3 (rincian pelanggaran) dan Poin 4 (validasi "tidak ada pelanggaran").
   * Hanya record yang aktif (is_active=true DAN deleted_at=null).
   */
  async getViolationLogDetails(
    vendorId: number,
    quarter: number,
    year: number,
  ) {
    return this.prisma.vendor_violation_log.findMany({
      where: {
        vendor_id: vendorId,
        quarter,
        year,
        is_active: true,
        deleted_at: null,
      },
      orderBy: { created_at: 'asc' },
      include: {
        violation_type: {
          select: {
            id: true,
            code: true,
            name: true,
            category: true,
            point: true,
          },
        },
        orders: {
          select: { id: true, project_number: true, status: true },
        },
      },
    });
  }

  /**
   * Lookup SP aktif (atau semua SP) untuk vendor + quarter. Untuk Poin3
   * (menampilkan status SP di PDF). Return null kalau tidak ada SP di kuartal tsb.
   */
  async getSpByVendorAndQuarter(
    vendorId: number,
    quarter: number,
    year: number,
  ) {
    return this.prisma.vendor_sp.findFirst({
      where: {
        vendor_id: vendorId,
        quarter,
        year,
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
      include: {
        vendor: {
          select: {
            id: true,
            company_name: true,
            pic_name: true,
            email_address: true,
            is_active: true,
          },
        },
      },
    });
  }

  /**
   * Kuartal berjalan saat ini. Untuk Poin 4 validasi "kuartal harus lampau".
   */
  getCurrentQuarterInfo(now: Date = new Date()): {
    quarter: number;
    year: number;
  } {
    return {
      quarter: Math.ceil((now.getMonth() + 1) / 3),
      year: now.getFullYear(),
    };
  }

  /**
   * Cek apakah kuartal (quarter, year) sudah lampau dibanding now().
   * Return true kalau quarter/year < current quarter/year (secara kronologis).
   * Kuartal yang sedang berjalan dihitung BELUM lampau.
   */
  isPastQuarter(
    quarter: number,
    year: number,
    now: Date = new Date(),
  ): boolean {
    const current = this.getCurrentQuarterInfo(now);
    if (year < current.year) return true;
    if (year > current.year) return false;
    return quarter < current.quarter;
  }

  /**
   * Quarter start/end sebagai Date range untuk query created_at.
   * Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec.
   */
  private getQuarterRange(
    quarter: number,
    year: number,
  ): { start: Date; end: Date } {
    const quarterStartMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
    const start = new Date(year, quarterStartMonths[quarter - 1], 1);
    const end = new Date(year, quarter * 3, 0, 23, 59, 59, 999);
    return { start, end };
  }
}