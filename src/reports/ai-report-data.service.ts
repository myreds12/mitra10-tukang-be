import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';
import { OrderService } from '../order/order.service';
import { WorkOrdersService } from '../work_orders/work_orders.service';
import { RescheduleService } from '../reschedule/reschedule.service';
import { RemedialsService } from '../remedials/remedials.service';
import { VendorSpService } from '../vendor-sp/vendor-sp.service';
import { VendorViolationService } from '../vendor-violation/vendor-violation.service';
import { VendorService } from '../vendor/vendor.service';
import {
  DEFAULT_VENDOR_VIOLATION_TYPES,
  VENDOR_SP_POLICY_RULES,
  ViolationTypeRuleItem,
  buildSpAndSlaPolicyText,
} from '../common/constants/vendor-sp.constant';
import {
  AI_REPORT_CATALOG,
  AI_SKILL_DEFINITIONS,
  AiSkillCatalogDefinition,
  ExtractedWibPeriod,
  ReportCatalogItem,
  detectSkillAndReports,
  extractPeriodWib,
  normalizeUserInputForSearch,
} from './ai-report-catalog';
import { AiSessionState, AiSessionStateService } from './ai-session-state.service';
import { AiSqlExecutorService } from './ai-sql-executor.service';

export interface FetchedCatalogReportPayload {
  key: string;
  title: string;
  aggregates: Record<string, any>;
  sampleRows: Record<string, any>[];
  meta: {
    total: number;
    ditampilkan: number;
    periode: string;
    sumber: string;
    waktu: string;
    excludedTestCount: number;
  };
}

const REVISION_KEYWORD_REGEX =
  /\b(revisi|ubah|ganti|perbaiki|koreksi|update|tambahkan|hilangkan|hapus|sesuaikan)\b/i;

const COMPARISON_KEYWORD_REGEX =
  /\b(bandingkan|banding|dibandingkan|dibanding|vs|versus|perbandingan)\b/i;

const FORMAT_SWITCH_REGEX =
  /^(jadikan|ubah\s+ke|ganti\s+ke|export\s+ke|cetak|buatkan\s+format|simpan\s+ke|format)\s+(pdf|pfd|word|wrod|wod|docx|excel|excl|exel|xcel|xlsx|spreadsheet|dokumen)/i;

const EXACT_GREETING_REGEX =
  /^(halo+|hai+|hi+|hello+|tes|test|testing|ping|p|pagi|siang|sore|malam|selamat\s+(pagi|siang|sore|malam)|terima\s*kasih|makasih|thanks|thank\s*you|ok|oke|siap|mantap|cek|assalamualaikum)[\s!.,?]*$/i;

export function isRevisionPrompt(userPrompt: string): boolean {
  if (!userPrompt) return false;
  return REVISION_KEYWORD_REGEX.test(userPrompt);
}

export function isComparisonPrompt(userPrompt: string): boolean {
  if (!userPrompt) return false;
  return COMPARISON_KEYWORD_REGEX.test(userPrompt);
}

export function isFormatSwitchPrompt(userPrompt: string): boolean {
  if (!userPrompt) return false;
  const clean = userPrompt.trim().toLowerCase();
  return (
    FORMAT_SWITCH_REGEX.test(clean) ||
    /^(jadikan|buatkan)\s+(pdf|pfd|word|wrod|wod|excel|excl|exel|xcel|docx|xlsx|spreadsheet)[\s!.,?]*$/i.test(clean) ||
    /^(pdf|pfd|word|wrod|wod|excel|excl|exel|xcel|docx|xlsx|spreadsheet)[\s!.,?]*$/i.test(clean)
  );
}

export function hasDomainKeywords(userPrompt: string): boolean {
  const lower = String(userPrompt || '').toLowerCase();
  const domainKeywords = AI_SKILL_DEFINITIONS.flatMap((s) => s.keywords);
  return domainKeywords.some((kw) => lower.includes(kw));
}

export type BackendAiIntent =
  | 'greeting'
  | 'format_switch'
  | 'comparison'
  | 'follow_up'
  | 'new_report'
  | 'query'
  | 'clarification';

export const ALLOWED_AI_ENGINE_MODES = [
  '9router-gemini',
  'deepseek-deploy',
  'local-analyst',
  'claude-api',
  'claude-free',
  'openrouter',
] as const;

export type AllowedAiEngineMode = (typeof ALLOWED_AI_ENGINE_MODES)[number];

export const ALLOWED_MODELS_BY_ENGINE: Record<string, { defaultModel: string; allowed: string[] }> = {
  '9router-gemini': {
    defaultModel: 'ag/gemini-3-flash',
    allowed: [
      'ag/gemini-3-flash',
      'ag/gemini-3.1-pro-high',
      'ag/gemini-3.1-pro-low',
      'ai-combo',
      'gc/gemini-2.5-pro',
      'gc/gemini-2.5-flash',
      'gemini/gemini-2.5-pro',
      'gemini/gemini-2.5-flash',
    ],
  },
  'deepseek-deploy': {
    defaultModel: 'deepseek-ai/deepseek-v4.1-flash-1017',
    allowed: ['deepseek-ai/deepseek-v4.1-flash-1017'],
  },
  'claude-api': {
    defaultModel: 'claude-3-5-sonnet-latest',
    allowed: [
      'claude-3-5-sonnet-latest',
      'claude-3-7-sonnet-latest',
      'claude-3-haiku-20240307',
    ],
  },
  'claude-free': {
    defaultModel: 'claude-3-5-sonnet-latest',
    allowed: ['claude-3-5-sonnet-latest'],
  },
  openrouter: {
    defaultModel: 'anthropic/claude-3.5-sonnet',
    allowed: [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3.7-sonnet',
      'anthropic/claude-3-haiku',
    ],
  },
};

export interface AiChatRequestDto {
  sessionId?: string;
  userPrompt?: string;
  history?: Array<{ role: string; content: string }>;
  activeSkillId?: string;
  requestedFormat?: 'pdf' | 'word' | 'excel' | null;
  engineMode?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  reasoningEffort?: string;
  payload?: any;
}

@Injectable()
export class AiReportDataService {
  private readonly logger = new Logger(AiReportDataService.name);

  constructor(
    private readonly dbService: PrismaService,
    private readonly reportsService: ReportsService,
    private readonly orderService: OrderService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly rescheduleService: RescheduleService,
    private readonly remedialsService: RemedialsService,
    private readonly vendorSpService: VendorSpService,
    private readonly vendorViolationService: VendorViolationService,
    private readonly vendorService: VendorService,
    private readonly sessionStateService: AiSessionStateService,
    private readonly sqlExecutorService: AiSqlExecutorService,
  ) {}

  private isTestRecord(row: any): boolean {
    if (!row || typeof row !== 'object') return false;
    const candidates = [
      row.vendor_name,
      row.company_name,
      row.customer_name,
      row.pic_name,
      row.sales_name,
      row.sp_number,
      row.order_code,
      row.project_number,
      row.vendor?.company_name,
      row.order?.members?.full_name,
      row.members?.full_name,
    ]
      .filter(Boolean)
      .map((s) => String(s).toUpperCase());

    return candidates.some(
      (val) =>
        val.startsWith('SP_TEST') ||
        val.startsWith('SP_ORDER_RULE') ||
        val.startsWith('TEST') ||
        val.startsWith('DUMMY') ||
        val.includes('SP_TEST_') ||
        val.includes('SP_ORDER_RULE_'),
    );
  }

  private normalizeRowForCatalog(key: string, raw: any): Record<string, any> {
    if (!raw || typeof raw !== 'object') return {};

    switch (key) {
      case 'orders': {
        const latestQuotation = Array.isArray(raw.quotation) ? raw.quotation[0] : undefined;
        return {
          id: raw.id,
          order_code: raw.project_number || `ORD-${raw.id}`,
          created_at: raw.created_at,
          customer_name: raw.members?.full_name || raw.customer_name || '-',
          store_name: raw.store?.store_name || '-',
          vendor_name: raw.vendor?.company_name || '-',
          status_code: raw.status?.category || raw.status?.status_name || '-',
          service_name: raw.payment_type || '-',
          grand_total: Number(raw.grand_total || latestQuotation?.quotation_grand_total || 0),
        };
      }
      case 'sales_comission': {
        return {
          id: raw.id,
          sales_name: raw.sales?.full_name || '-',
          nik: raw.sales?.nik || '-',
          store_name: raw.sales?.store?.store_name || raw.quotation?.order?.store?.store_name || '-',
          order_code: raw.quotation?.order?.project_number || `ORD-${raw.quotation?.order_id || '-'}`,
          quotation_grand_total: Number(raw.quotation?.quotation_grand_total || 0),
          commission_amount: Number(raw.nominal || 0),
          created_at: raw.created_at,
        };
      }
      case 'work_orders': {
        const tukangNames = Array.isArray(raw.work_order_tukang)
          ? raw.work_order_tukang
              .map((wt: any) => wt?.tukang?.full_name)
              .filter(Boolean)
              .join(', ')
          : '-';
        return {
          id: raw.id,
          wo_code: `WO-${raw.id}`,
          order_code: raw.order?.project_number || `ORD-${raw.order_id || '-'}`,
          vendor_name: raw.vendor?.company_name || '-',
          store_name: raw.order?.store?.store_name || '-',
          status_code: raw.status?.category || raw.status?.status_name || '-',
          start_date: raw.work_date || raw.survey_date || null,
          end_date: raw.work_end_date || null,
          tukang_names: tukangNames || '-',
          created_at: raw.created_at,
        };
      }
      case 'reschedule': {
        return {
          id: raw.id,
          order_code: raw.order?.project_number || `ORD-${raw.order_id || '-'}`,
          vendor_name: raw.order?.vendor?.company_name || '-',
          reason: raw.reschedule_status?.[0]?.description || '-',
          old_date: raw.order?.request_survey || null,
          new_date: raw.reschedule_date || null,
          status_code: raw.status?.category || raw.status?.status_name || '-',
          created_at: raw.created_at,
        };
      }
      case 'remedials': {
        return {
          id: raw.id,
          remedial_code: `REM-${raw.id}`,
          order_code: raw.complaints?.orders?.project_number || `CMP-${raw.complaint_id || '-'}`,
          vendor_name: raw.remedial_pic || '-',
          store_name: '-',
          reason: raw.remedial_action || '-',
          status_code: raw.status?.category || String(raw.remedial_status ?? '-'),
          created_at: raw.created_at || raw.ra_date_start,
        };
      }
      case 'vendor_sp_list': {
        return {
          id: raw.id,
          sp_number: raw.sp_number || `SP-${raw.id}`,
          vendor_id: raw.vendor_id,
          vendor_name: raw.vendor?.company_name || raw.vendor_name || '-',
          sp_level: raw.sp_level,
          quarter: raw.quarter,
          year: raw.year,
          total_point: Number(raw.total_point ?? raw.points_snapshot ?? 0),
          status: raw.status || '-',
          issued_at: raw.issued_at || raw.start_date || raw.created_at,
          appeal_status: raw.appeal_status || 'NONE',
        };
      }
      case 'vendor_sp_matrix': {
        const activeSpLevel = raw.activeSp?.sp_level
          ? `SP${raw.activeSp.sp_level}`
          : raw.q4 || raw.q3 || raw.q2 || raw.q1 || '-';
        return {
          id: raw.id,
          company_name: raw.company_name || '-',
          is_active: Boolean(raw.is_active),
          active_sp_level: activeSpLevel,
          q1_sp: raw.q1 || '-',
          q2_sp: raw.q2 || '-',
          q3_sp: raw.q3 || '-',
          q4_sp: raw.q4 || '-',
          quarter_violation_points: Number(raw.quarterViolationPoints ?? 0),
          total_orders: Number(raw.ordersAggregate?._count?.id ?? 0),
        };
      }
      case 'vendor_violations': {
        return {
          id: raw.id,
          vendor_id: raw.vendor_id,
          vendor_name: raw.vendor?.company_name || raw.vendor_name || '-',
          order_code: raw.orders?.project_number || (raw.order_id ? `ORD-${raw.order_id}` : '-'),
          violation_code: raw.violation_type?.code || raw.violation_code || '-',
          violation_name: raw.violation_type?.name || raw.violation_name || '-',
          point: Number(raw.violation_type?.point ?? raw.point_deducted ?? raw.point ?? 0),
          quarter: raw.quarter,
          year: raw.year,
          status: raw.status || 'VALID',
          source: raw.evidence_provenance || raw.source || 'SYSTEM',
          detected_at: raw.created_at,
        };
      }
      case 'vendor': {
        return {
          id: raw.id,
          company_name: raw.company_name || '-',
          pic_name: raw.pic_name || '-',
          phone_number: raw.phone_number || '-',
          is_active: Boolean(raw.is_active),
          rating_avg: Number(raw.rating_avg ?? 0),
          active_sp_level: raw.activeSp?.sp_level ? `SP${raw.activeSp.sp_level}` : '-',
          quarter_violation_points: Number(raw.quarterViolationPoints ?? 0),
          orders_count: Number(raw.ordersAggregate?._count?.id ?? 0),
          paid_total: Number(raw.paidAggregate?._sum?.grand_total ?? 0),
          unpaid_total: Number(raw.unpaidAggregate?._sum?.grand_total ?? 0),
        };
      }
      case 'invoices_paid_unpaid': {
        return {
          id: raw.id,
          invoice_number: raw.invoice_number || `INV-${raw.id}`,
          vendor_name: raw.vendor?.company_name || '-',
          total_amount: Number(raw.total_amount || 0),
          status: raw.status || 'UNPAID',
          created_at: raw.created_at,
        };
      }
      case 'quotation_report': {
        return {
          id: raw.id,
          quotation_number: raw.quotation_number || `QTN-${raw.id}`,
          store_name: raw.store?.store_name || '-',
          customer_name: raw.order?.members?.full_name || '-',
          quotation_grand_total: Number(raw.quotation_grand_total || 0),
          status_code: String(raw.quotation_status ?? '-'),
          created_at: raw.created_at,
        };
      }
      case 'complaints_report': {
        return {
          id: raw.id,
          complaint_code: `CMP-${raw.id}`,
          order_code: raw.orders?.project_number || (raw.order_id ? `ORD-${raw.order_id}` : '-'),
          customer_name: raw.orders?.members?.full_name || '-',
          pic_name: raw.pic_name || '-',
          type: raw.type || '-',
          description: raw.description || '-',
          created_at: raw.created_at || raw.complaint_date,
        };
      }
      case 'refund_penalty_voucher': {
        return {
          id: raw.id,
          order_code: raw.orders?.project_number || (raw.order_id ? `ORD-${raw.order_id}` : '-'),
          reason: raw.reason || '-',
          penalty_nominal: Number(raw.penalty_nominal || 0),
          refund_status: String(raw.refund_status ?? '-'),
          created_at: raw.created_at || raw.date_of_filing,
        };
      }
      case 'csi_report': {
        return {
          id: raw.id,
          order_code: raw.orders?.project_number || (raw.order_id ? `ORD-${raw.order_id}` : '-'),
          csi_survey: Boolean(raw.csi_survey),
          csi_work: Boolean(raw.csi_work),
          is_done: Boolean(raw.is_done),
          created_at: raw.created_at,
        };
      }
      case 'store_comission_report': {
        return {
          id: raw.id,
          sales_name: raw.full_name || '-',
          store_name: raw.store?.store_name || '-',
          order_total: Number(raw.order_total || 0),
          created_at: raw.created_at,
        };
      }
      case 'tukang_productivity': {
        return {
          id: raw.id,
          tukang_name: raw.full_name || '-',
          vendor_name: raw.vendor?.company_name || '-',
          phone_number: raw.phone_number || '-',
          is_active: Boolean(raw.is_active),
          total_work_orders: Array.isArray(raw.work_order_tukang) ? raw.work_order_tukang.length : 0,
        };
      }
      default:
        return raw;
    }
  }

  private applyWhitelist(row: Record<string, any>, whitelist: string[]): Record<string, any> {
    if (!whitelist || whitelist.length === 0) return row;
    const out: Record<string, any> = {};
    for (const field of whitelist) {
      if (row[field] !== undefined) {
        out[field] = row[field];
      } else {
        out[field] = null;
      }
    }
    return out;
  }

  async getActiveViolationTypes(): Promise<ViolationTypeRuleItem[]> {
    try {
      const res = await this.vendorViolationService.findAllViolationTypes({
        page: 1,
        take: 50,
        is_active: true,
      });
      const rows = Array.isArray(res?.data) ? res.data : [];
      if (rows.length > 0) {
        return rows.map((r: any) => ({
          code: r.code,
          name: r.name,
          point: Number(r.point || 0),
          category: r.category || 'GENERAL',
          description: r.description,
        }));
      }
    } catch (err) {
      this.logger.warn(`Fallback ke DEFAULT_VENDOR_VIOLATION_TYPES: ${(err as Error)?.message}`);
    }
    return DEFAULT_VENDOR_VIOLATION_TYPES;
  }

  async getCatalogAndRulesPayload() {
    const violationTypes = await this.getActiveViolationTypes();
    return {
      rules: VENDOR_SP_POLICY_RULES,
      policyText: buildSpAndSlaPolicyText(VENDOR_SP_POLICY_RULES, violationTypes),
      violationTypes,
      skills: AI_SKILL_DEFINITIONS,
      catalog: AI_REPORT_CATALOG.map((item) => ({
        key: item.key,
        title: item.title,
        skill: item.skill,
        status: item.status,
        sumber: item.sumber,
        allowedParams: item.allowedParams,
        fieldWhitelist: item.fieldWhitelist,
        maxRows: item.maxRows,
        unavailableReason: item.unavailableReason || null,
      })),
    };
  }

  async fetchSingleCatalogReport(
    item: ReportCatalogItem,
    period: ExtractedWibPeriod,
    extraFilters: { status?: any; store_id?: any; vendor_id?: any } = {},
    user?: any,
  ): Promise<FetchedCatalogReportPayload> {
    const nowIso = new Date().toISOString();
    let rawResult: any = { data: [], meta: { total: 0 } };

    try {
      switch (item.key) {
        case 'reports_orders': {
          rawResult = await this.reportsService.reportOrder({
            date_from: period.date_from,
            date_to: period.date_to,
            status: extraFilters.status,
            store_id: extraFilters.store_id,
            vendor_id: extraFilters.vendor_id,
          } as any);
          break;
        }
        case 'daerah_terlaris': {
          const orderYear = period.date_from.slice(0, 4);
          const sameMonth =
            period.date_from.slice(0, 7) === period.date_to.slice(0, 7)
              ? String(Number(period.date_from.slice(5, 7)))
              : undefined;
          rawResult = await this.reportsService.daerahTerlarisReport({
            orderYear,
            orderMonth: sameMonth,
          });
          break;
        }
        case 'toko_jasa_instalasi': {
          const orderYear = period.date_from.slice(0, 4);
          const sameMonth =
            period.date_from.slice(0, 7) === period.date_to.slice(0, 7)
              ? String(Number(period.date_from.slice(5, 7)))
              : undefined;
          rawResult = await this.reportsService.tokoJasaInstalasiReport({
            orderYear,
            orderMonth: sameMonth,
          });
          break;
        }
        case 'sales_comission': {
          rawResult = await this.reportsService.salesComissionReport({
            page: 1,
            take: item.maxRows + 15,
            date_from: period.date_from,
            date_to: period.date_to,
            store_id: extraFilters.store_id,
          } as any);
          break;
        }
        case 'orders': {
          rawResult = await this.orderService.findAll({
            page: 1,
            take: item.maxRows + 15,
            date_from: period.date_from,
            date_to: period.date_to,
            status: extraFilters.status,
            store_id: extraFilters.store_id,
            vendor_id: extraFilters.vendor_id,
          } as any);
          break;
        }
        case 'work_orders': {
          rawResult = await this.workOrdersService.findAll({
            page: 1,
            take: item.maxRows + 15,
            date_from: period.date_from,
            date_to: period.date_to,
            status: extraFilters.status,
            store_id: extraFilters.store_id,
            vendor_id: extraFilters.vendor_id,
          } as any);
          break;
        }
        case 'reschedule': {
          rawResult = await this.rescheduleService.findAll({
            page: 1,
            take: item.maxRows + 15,
            date_from: period.date_from,
            date_to: period.date_to,
            vendor_id: extraFilters.vendor_id,
          } as any);
          break;
        }
        case 'remedials': {
          const remedialRows = await this.remedialsService.findAll({
            page: 1,
            take: item.maxRows + 15,
            status: extraFilters.status,
          } as any);
          rawResult = {
            data: Array.isArray(remedialRows) ? remedialRows : [],
            meta: { total: Array.isArray(remedialRows) ? remedialRows.length : 0 },
          };
          break;
        }
        case 'vendor_sp_list': {
          rawResult = await this.vendorSpService.findAll(
            {
              page: 1,
              take: item.maxRows + 20,
              quarter: period.quarter,
              year: period.year,
              vendor_id: extraFilters.vendor_id,
            } as any,
            user,
          );
          break;
        }
        case 'vendor_sp_summary': {
          const spListRes = await this.vendorSpService.findAll(
            {
              page: 1,
              take: 250,
              quarter: period.quarter,
              year: period.year,
              vendor_id: extraFilters.vendor_id,
            } as any,
            user,
          );
          const allSpRows = (Array.isArray(spListRes?.data) ? spListRes.data : []).filter(
            (r: any) => !this.isTestRecord(r),
          );
          const summaryRow = {
            quarter: period.quarter,
            year: period.year,
            total_active_sp: allSpRows.filter((r: any) => r.status === 'ACTIVE' || r.status === 'EXTENDED').length,
            sp1_count: allSpRows.filter((r: any) => Number(r.sp_level) === 1).length,
            sp2_count: allSpRows.filter((r: any) => Number(r.sp_level) === 2).length,
            sp3_count: allSpRows.filter((r: any) => Number(r.sp_level) === 3).length,
            suspended_vendor_count: allSpRows.filter(
              (r: any) => Number(r.sp_level) === 3 && (r.status === 'ACTIVE' || r.status === 'EXTENDED'),
            ).length,
            pending_appeal_count: allSpRows.filter((r: any) => r.appeal_status === 'PENDING').length,
          };
          rawResult = {
            data: [summaryRow],
            meta: { total: 1 },
          };
          break;
        }
        case 'vendor_sp_matrix':
        case 'vendor': {
          rawResult = await this.vendorService.findAll({
            page: 1,
            take: item.maxRows + 20,
            order_date_from: period.date_from,
            order_date_to: period.date_to,
            id_vendor: extraFilters.vendor_id,
          } as any);
          break;
        }
        case 'vendor_violations': {
          rawResult = await this.vendorViolationService.findAllViolationLogs(
            {
              page: 1,
              take: item.maxRows + 20,
              quarter: period.quarter,
              year: period.year,
              date_from: period.date_from,
              date_to: period.date_to,
              vendor_id: extraFilters.vendor_id,
            } as any,
            user,
          );
          break;
        }
        case 'invoices_paid_unpaid': {
          const invRows = await this.dbService.invoices.findMany({
            where: {
              deleted_at: null,
              ...(extraFilters.vendor_id ? { vendor_id: Number(extraFilters.vendor_id) } : {}),
            },
            include: { vendor: true },
            orderBy: { created_at: 'desc' },
            take: item.maxRows + 15,
          });
          rawResult = { data: invRows, meta: { total: invRows.length } };
          break;
        }
        case 'quotation_report': {
          const qtnRows = await this.dbService.quotation.findMany({
            where: {
              deleted_at: null,
              ...(extraFilters.store_id ? { store_id: Number(extraFilters.store_id) } : {}),
            },
            include: {
              store: true,
              order: { include: { members: true, vendor: true } },
            },
            orderBy: { quotation_grand_total: 'desc' },
            take: item.maxRows + 15,
          });
          rawResult = { data: qtnRows, meta: { total: qtnRows.length } };
          break;
        }
        case 'complaints_report': {
          const cmpRows = await this.dbService.complaints.findMany({
            where: {
              deleted_at: null,
            },
            include: { orders: { include: { members: true, store: true } } },
            orderBy: { created_at: 'desc' },
            take: item.maxRows + 15,
          });
          rawResult = { data: cmpRows, meta: { total: cmpRows.length } };
          break;
        }
        case 'refund_penalty_voucher': {
          const refRows = await this.dbService.refund.findMany({
            where: {
              deleted_at: null,
            },
            include: { orders: { include: { members: true } } },
            orderBy: { created_at: 'desc' },
            take: item.maxRows + 15,
          });
          rawResult = { data: refRows, meta: { total: refRows.length } };
          break;
        }
        case 'csi_report': {
          const csiRows = await this.dbService.order_follow_up.findMany({
            where: {
              deleted_at: null,
            },
            include: { orders: true },
            orderBy: { created_at: 'desc' },
            take: item.maxRows + 15,
          });
          rawResult = { data: csiRows, meta: { total: csiRows.length } };
          break;
        }
        case 'store_comission_report': {
          const scRows = await this.dbService.sales.findMany({
            where: {
              deleted_at: null,
              ...(extraFilters.store_id ? { store_id: Number(extraFilters.store_id) } : {}),
            },
            include: { store: true },
            orderBy: { order_total: 'desc' },
            take: item.maxRows + 15,
          });
          rawResult = { data: scRows, meta: { total: scRows.length } };
          break;
        }
        case 'tukang_productivity': {
          const tkRows = await this.dbService.tukang.findMany({
            where: {
              deleted_at: null,
              ...(extraFilters.vendor_id ? { vendor_id: Number(extraFilters.vendor_id) } : {}),
            },
            include: { vendor: true, work_order_tukang: true },
            orderBy: { created_at: 'desc' },
            take: item.maxRows + 15,
          });
          rawResult = { data: tkRows, meta: { total: tkRows.length } };
          break;
        }
      }
    } catch (err) {
      this.logger.warn(`Gagal mengambil laporan katalog "${item.key}": ${(err as Error)?.message}`);
    }

    const rawRows: any[] = Array.isArray(rawResult?.data) ? rawResult.data : [];
    let excludedTestCount = 0;
    const cleanRawRows = rawRows.filter((row) => {
      if (this.isTestRecord(row)) {
        excludedTestCount++;
        return false;
      }
      return true;
    });

    const normalizedRows = cleanRawRows.map((row) => this.normalizeRowForCatalog(item.key, row));
    const slicedRows = normalizedRows.slice(0, item.maxRows);
    const whitelistedRows = slicedRows.map((row) => this.applyWhitelist(row, item.fieldWhitelist));
    const rawTotal = Number(
      rawResult?.meta?.total ?? rawResult?.meta?.countTotal ?? rawResult?.total ?? cleanRawRows.length,
    );
    const total = Math.max(0, rawTotal - excludedTestCount);
    const aggregates = item.summarize(rawResult, whitelistedRows);

    return {
      key: item.key,
      title: item.title,
      aggregates,
      sampleRows: whitelistedRows,
      meta: {
        total,
        ditampilkan: whitelistedRows.length,
        periode: period.label,
        sumber: item.sumber,
        waktu: nowIso,
        excludedTestCount,
      },
    };
  }

  classifyIntent(userPrompt: string, hasSessionState = false): BackendAiIntent {
    const clean = String(userPrompt || '').trim().toLowerCase();
    const normalized = normalizeUserInputForSearch(clean);
    if (EXACT_GREETING_REGEX.test(clean) || EXACT_GREETING_REGEX.test(normalized)) return 'greeting';

    if (isFormatSwitchPrompt(clean) || isFormatSwitchPrompt(normalized)) return 'format_switch';
    if (isComparisonPrompt(clean) || isComparisonPrompt(normalized)) return 'comparison';

    if (
      /^(tolong\s+)?(cek|lihat|tampilkan|buka)\s+(data(\s+yang\s+ada)?|sistem|aplikasi)[\s!.,?]*$/i.test(clean) ||
      /^(tolong\s+)?(cek|lihat|tampilkan|buka)\s+(data(\s+yang\s+ada)?|sistem|aplikasi)[\s!.,?]*$/i.test(normalized)
    ) {
      return 'clarification';
    }

    const reportKeywords = [
      'pdf',
      'pfd',
      'word',
      'wrod',
      'wod',
      'docx',
      'excel',
      'excl',
      'exel',
      'xcel',
      'xlsx',
      'spreadsheet',
      'cetak',
      'print',
      'unduh',
      'download',
      'export',
      'dokumen',
      'laporan',
      'rekap',
      'rekapitulasi',
      'surat peringatan',
      'report',
    ];
    const hasReportKw = reportKeywords.some((kw) => clean.includes(kw) || normalized.includes(kw));

    if (hasReportKw) {
      return 'new_report';
    }

    if (hasSessionState) {
      return 'follow_up';
    }

    return 'query';
  }

  detectRequestedFormat(userPrompt: string): 'pdf' | 'word' | 'excel' | null {
    const lower = String(userPrompt || '').toLowerCase();
    const normalized = normalizeUserInputForSearch(lower);
    if (/\b(pdf|pfd|cetak|print)\b/.test(lower) || /\b(pdf|cetak|print)\b/.test(normalized)) return 'pdf';
    if (/\b(word|docx|wrod|wod)\b/.test(lower) || /\b(word|docx)\b/.test(normalized)) return 'word';
    if (/\b(excel|xlsx|spreadsheet|excl|exel|xcel)\b/.test(lower) || /\b(excel|xlsx|spreadsheet)\b/.test(normalized)) return 'excel';
    return null;
  }

  private buildBackendSystemPrompt(params: {
    intent: BackendAiIntent;
    skill: AiSkillCatalogDefinition;
    period: ExtractedWibPeriod;
    requestedFormat: 'pdf' | 'word' | 'excel' | null;
    fetchedReports: FetchedCatalogReportPayload[];
    unavailableReports: ReportCatalogItem[];
    violationTypes: ViolationTypeRuleItem[];
    comparisonPeriod?: ExtractedWibPeriod;
    comparisonReports?: FetchedCatalogReportPayload[];
  }): string {
    const {
      intent,
      skill,
      period,
      requestedFormat,
      fetchedReports,
      unavailableReports,
      violationTypes,
      comparisonPeriod,
      comparisonReports,
    } = params;

    if (intent === 'greeting') {
      return [
        'Kamu adalah AI Report Assistant untuk platform Mitra10 Tukang (khusus Admin HO & Super User).',
        'Jawab dalam Bahasa Indonesia baku, ramah, dan singkat (maksimal 3 kalimat).',
        'JANGAN membuat tag <dokumen> untuk sapaan atau percakapan ringan.',
        'Tawarkan 3 contoh permintaan laporan yang tersedia: (1) Rekap Order Juni sampai Oktober PDF, (2) Evaluasi SP Vendor Q2 2026, (3) Laporan Komisi Sales bulan ini.',
      ].join('\n');
    }

    if (intent === 'clarification') {
      return [
        'Kamu adalah AI Report Assistant untuk platform Mitra10 Tukang.',
        'Permintaan pengguna belum spesifik menyebutkan topik laporan.',
        'Tanyakan dengan sopan dan singkat jenis laporan apa yang ingin dianalisis dari 6 skill resmi Mitra10 Tukang (Order & Omzet, Quotation & Tagihan, Work Order, SP Vendor, Komplain, Komisi Store).',
        'JANGAN mengarang data atau membuat tag <dokumen>.',
      ].join('\n');
    }

    const totalExcluded = fetchedReports.reduce((acc, r) => acc + r.meta.excludedTestCount, 0);
    const spPolicySection =
      skill.id === 'vendor_sp_and_performance' || skill.id === 'quotation_and_billing_report'
        ? buildSpAndSlaPolicyText(VENDOR_SP_POLICY_RULES, violationTypes)
        : '';

    const dataPayloadText = JSON.stringify(
      {
        periodeWib: period,
        skillAktif: { id: skill.id, name: skill.name },
        totalDataUjiCobaDikecualikan: totalExcluded,
        laporanTersedia: fetchedReports,
        ...(comparisonPeriod && comparisonReports
          ? {
              periodePerbandinganWib: comparisonPeriod,
              laporanPerbandingan: comparisonReports,
            }
          : {}),
      },
      null,
      2,
    );

    let formatInstruction = '';
    if (requestedFormat) {
      formatInstruction = `Format dokumen yang diminta pengguna: "${requestedFormat}". Seluruh isi dokumen laporan WAJIB dibungkus persis begini:\n<dokumen format="${requestedFormat}" judul="Judul Singkat">\n...isi markdown...\n</dokumen>\nCHAT di luar tag dokumen maksimal 4 kalimat.`;
    } else if (intent === 'new_report') {
      formatInstruction =
        'Buatkan ringkasan temuan di CHAT (maksimal 4 kalimat) dan lampirkan laporan lengkap dalam tag <dokumen format="pdf" judul="...">...markdown...</dokumen>.';
    } else {
      formatInstruction =
        'Pengguna hanya bertanya data: jawab langsung di CHAT (tabel ringkas maksimal 5 baris diperbolehkan) dan JANGAN membuat tag <dokumen> kecuali jika pengguna meminta dokumen.';
    }

    const sqlSchemaPrompt = this.sqlExecutorService.getDatabaseSchemaPrompt();

    return [
      '# ATURAN KELUARAN AI REPORT ASSISTANT MITRA10 TUKANG (PRIORITAS TERTINGGI)',
      '1. Gunakan Bahasa Indonesia baku dan huruf Latin saja. Format tanggal: "7 November 2026". Format mata uang: "Rp 1.250.000".',
      '2. Jangan mengarang angka, nama vendor, nama pelanggan, atau nomor dokumen.',
      `3. Periode analisis: ${period.label}. ${period.assumptionNote} Sebutkan asumsi periode ini di pengantar chat jika relevan.`,
      comparisonPeriod
        ? `3b. Melakukan analisis perbandingan dengan periode: ${comparisonPeriod.label}. Tunjukkan kenaikan/penurunan (growth/drop) angka kunci.`
        : '',
      totalExcluded > 0
        ? `4. Sebutkan di bagian akhir: "${totalExcluded} data uji coba dikecualikan."`
        : '4. Data uji coba (SP_TEST, SP_ORDER_RULE, DUMMY, TEST) telah disaring secara otomatis oleh backend.',
      '5. Kanal balasan terdiri dari CHAT (maksimal 4 kalimat di luar tag <dokumen>) dan opsional <dokumen format="pdf|word|excel" judul="...">...markdown...</dokumen>.',
      '6. DILARANG menulis tag HTML seperti <br> di dalam tabel markdown.',
      formatInstruction,
      spPolicySection,
      '',
      '# KEMAMPUAN BAHASA UNIVERSAL & KETAHANAN TERHADAP TYPO (MULTI-LANGUAGE & SLANG RESILIENT)',
      '- Anda memahami segala gaya bahasa pengguna: Bahasa Indonesia formal, percakapan sehari-hari/slang gaul (misal: "brp", "blm", "udh", "bnyk", "gw", "lu", "rekapin", "liatkan"), bahasa daerah populer, English penuh ("which store has most complaints"), maupun Indoglish campuran.',
      '- Anda SANGAT TOLERAN terhadap kesalahan ketik (typo) dan singkatan operasional: "omset/omzt" = omzet, "komplen" = komplain, "reskedul/reschedul" = reschedule, "pfd" = pdf, "excl/exel" = excel, "wrod" = word, "qtn/kwotasi" = quotation, "wo/spk" = work order, "inv/invois" = invoice, "rfund" = refund, "pinalti" = penalti, "cust" = pelanggan/member, "tko" = toko, "tkng" = tukang.',
      '- DILARANG menolak perintah atau merasa bingung hanya karena typo atau kata gaul; pahami maksud inti pengguna berdasarkan domain bisnis Mitra10 Tukang.',
      '- Jawab pengguna secara profesional dan terstruktur dalam Bahasa Indonesia (atau sesuai bahasa yang diminta secara spesifik oleh pengguna).',
      '',
      '# KEMAMPUAN AKSES DATABASE LANGSUNG (TEXT-TO-SQL)',
      'Kamu memiliki kapabilitas query langsung ke database Microsoft SQL Server melalui query T-SQL read-only.',
      'Jika pertanyaan pengguna membutuhkan data, agregasi, pemeringkatan, pencarian spesifik, atau informasi yang belum tercakup lengkap di konteks di bawah, tuliskan query T-SQL di dalam tag <sql>SELECT ...</sql>.',
      'Backend akan OTOMATIS mengeksekusi query <sql> kamu dan memberikan hasil data aslinya di giliran berikutnya.',
      'Jika pertanyaan pengguna adalah sapaan santai ("halo", "tes", "terima kasih"), jawab langsung tanpa tag <sql>.',
      '',
      sqlSchemaPrompt,
      '',
      '=== KONTEKS DATA BACKEND (KATALOG LAPORAN PRE-AGGREGATED) ===',
      `Data per: ${new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
      dataPayloadText,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private buildDeterministicReply(params: {
    intent: BackendAiIntent;
    skill: AiSkillCatalogDefinition;
    period: ExtractedWibPeriod;
    requestedFormat: 'pdf' | 'word' | 'excel' | null;
    fetchedReports: FetchedCatalogReportPayload[];
    unavailableReports: ReportCatalogItem[];
  }): string {
    const { intent, skill, period, requestedFormat, fetchedReports, unavailableReports } = params;

    if (intent === 'greeting') {
      return 'Halo! Saya AI Report Assistant Mitra10 Tukang untuk Admin HO dan Super User. Silakan ajukan permintaan data atau laporan operasional, misalnya: (1) "Rekap order Juni sampai Oktober PDF", (2) "SP vendor Q2 2026", atau (3) "Laporan komisi sales bulan ini".';
    }

    if (intent === 'clarification') {
      return 'Permintaan Anda belum spesifik. Apakah Anda ingin menganalisis: 1) Order & Omzet, 2) Quotation & Invoice, 3) Work Order & Jadwal, 4) Evaluasi SP Vendor, 5) Komplain & Refund, atau 6) Komisi Store? Silakan sebutkan jenis laporan dan periode yang Anda inginkan.';
    }

    if (unavailableReports.length > 0 && fetchedReports.length === 0) {
      const titles = unavailableReports.map((u) => `"${u.title}"`).join(', ');
      const reasons = unavailableReports.map((u) => u.unavailableReason).join(' ');
      return `Mohon maaf, laporan ${titles} untuk periode ${period.label} saat ini **belum tersedia** di AI Report Assistant. ${reasons} Silakan gunakan laporan yang sudah siap seperti Rekap Order, Daerah Terlaris, Toko Jasa Instalasi, Work Order, Reschedule, Remedial, Komisi Sales, atau Evaluasi SP Vendor.`;
    }

    const totalExcluded = fetchedReports.reduce((acc, r) => acc + r.meta.excludedTestCount, 0);
    const summaryParts = fetchedReports.map(
      (r) => `${r.title}: total ${r.meta.total} baris (ditampilkan ${r.meta.ditampilkan} sampel)`,
    );
    const excludedNote = totalExcluded > 0 ? ` ${totalExcluded} data uji coba dikecualikan.` : '';

    if (intent === 'query' && !requestedFormat) {
      return `Berdasarkan data ${skill.name} pada periode ${period.label} (${period.assumptionNote}), tercatat ${summaryParts.join('; ')}.${excludedNote}`;
    }

    const fmt = requestedFormat || 'pdf';
    const docSections = fetchedReports
      .map((r) => {
        const aggLines = Object.entries(r.aggregates || {})
          .map(([k, v]) => `- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join('\n');
        return `## ${r.title}\n- Sumber: \`${r.meta.sumber}\`\n- Total Data: ${r.meta.total} baris (Ditampilkan: ${r.meta.ditampilkan} baris)\n${aggLines}`;
      })
      .join('\n\n');

    return [
      `Berikut adalah ringkasan ${skill.name} untuk periode ${period.label}. ${period.assumptionNote}${excludedNote} Dokumen lengkap dalam format ${fmt.toUpperCase()} siap diunduh melalui tombol di bawah.`,
      '',
      `<dokumen format="${fmt}" judul="${skill.name} - ${period.label}">`,
      `# ${skill.name}`,
      `**Periode:** ${period.label}`,
      '',
      docSections,
      totalExcluded > 0 ? `\n*Catatan: ${totalExcluded} data uji coba dikecualikan.*` : '',
      `</dokumen>`,
    ].join('\n');
  }

  private resolveUpstreamEngineConfig(body: AiChatRequestDto): {
    engineMode: AllowedAiEngineMode;
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
  } {
    const rawEngineMode = String(body?.engineMode || '9router-gemini').trim();
    if (!(ALLOWED_AI_ENGINE_MODES as readonly string[]).includes(rawEngineMode)) {
      throw new BadRequestException(`Engine mode tidak dikenal: ${rawEngineMode}`);
    }
    const engineMode = rawEngineMode as AllowedAiEngineMode;

    if ((body as any)?.baseUrl) {
      this.logger.warn('Field body.baseUrl diabaikan; baseUrl ditentukan oleh server dari environment.');
    }
    if ((body as any)?.apiKey) {
      this.logger.warn('Field body.apiKey diabaikan; apiKey ditentukan oleh server dari environment.');
    }

    const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    const openRouterKey = (process.env.OPENROUTER_API_KEY || '').trim();

    if (engineMode === 'openrouter' && !openRouterKey) {
      throw new BadRequestException(
        'Engine "openrouter" belum dikonfigurasi di server (OPENROUTER_API_KEY belum tersedia di environment).',
      );
    }

    if ((engineMode === 'claude-api' || engineMode === 'claude-free') && !anthropicKey && !openRouterKey) {
      throw new BadRequestException(
        `Engine "${engineMode}" belum dikonfigurasi di server (ANTHROPIC_API_KEY / OPENROUTER_API_KEY belum tersedia di environment).`,
      );
    }

    let baseUrl = '';
    let apiKey = '';
    if (engineMode === '9router-gemini') {
      baseUrl = (process.env.NINE_ROUTER_BASE_URL || 'http://localhost:20128/v1').replace(/\/+$/, '');
      apiKey = process.env.NINE_ROUTER_API_KEY || '9router-local-key';
    } else if (engineMode === 'deepseek-deploy') {
      baseUrl = (process.env.DEPLOY_BASE_URL || 'https://api-cdn.deploy.com/api/v1').replace(/\/+$/, '');
      apiKey = process.env.DEPLOY_API_KEY || '';
    } else if (engineMode === 'openrouter' || engineMode === 'claude-api' || engineMode === 'claude-free') {
      baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
      apiKey = openRouterKey || anthropicKey;
    }

    const engineSpec = ALLOWED_MODELS_BY_ENGINE[engineMode] || ALLOWED_MODELS_BY_ENGINE['9router-gemini'];
    const envExtraModels = (process.env.AI_ALLOWED_MODELS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const allowedModels = new Set([...engineSpec.allowed, ...envExtraModels]);

    const requestedModel = String(body?.model || body?.payload?.model || '').trim();
    let resolvedModel = engineSpec.defaultModel;
    if (requestedModel) {
      if (allowedModels.has(requestedModel)) {
        resolvedModel = requestedModel;
      } else {
        this.logger.warn(
          `Model "${requestedModel}" tidak ada dalam daftar yang diizinkan untuk engine "${engineMode}". Diganti ke default "${engineSpec.defaultModel}".`,
        );
      }
    }

    let temperature = 0.2;
    if (body?.temperature !== undefined && body?.temperature !== null) {
      const parsedTemp = Number(body.temperature);
      if (!Number.isFinite(parsedTemp)) {
        this.logger.warn(`Temperature "${body.temperature}" tidak valid; diganti ke default 0.2.`);
      } else if (parsedTemp < 0 || parsedTemp > 1) {
        temperature = Math.min(1, Math.max(0, parsedTemp));
        this.logger.warn(`Temperature ${parsedTemp} di luar rentang [0, 1]; di-clamp menjadi ${temperature}.`);
      } else {
        temperature = parsedTemp;
      }
    }

    const maxTokens = Math.min(8192, Math.max(256, Number(process.env.AI_MAX_TOKENS) || 4096));

    return {
      engineMode,
      baseUrl,
      apiKey,
      model: resolvedModel,
      temperature,
      maxTokens,
    };
  }

  async handleAiChat(body: AiChatRequestDto, user: any) {
    const upstreamConfig = this.resolveUpstreamEngineConfig(body);

    const sessionId = String(body?.sessionId || '').trim();
    if (!sessionId || !/^[a-zA-Z0-9_-]{6,128}$/.test(sessionId)) {
      throw new BadRequestException(
        'sessionId wajib diisi dan harus berupa string aman (UUID / alphanumeric-hyphen 6-128 karakter).',
      );
    }
    const userId = user?.id ?? user?.user_id ?? user?.username;
    if (!userId) {
      throw new BadRequestException('User ID tidak terdeteksi dari autentikasi JWT.');
    }

    const prevState = await this.sessionStateService.get(userId, sessionId);

    const legacyMessages: Array<{ role: string; content: string }> = Array.isArray(body?.payload?.messages)
      ? body.payload.messages
      : [];
    const lastLegacyUserMsg = [...legacyMessages].reverse().find((m) => m.role === 'user')?.content || '';
    const userPrompt = String(body?.userPrompt || lastLegacyUserMsg || '').trim();

    const intent = this.classifyIntent(userPrompt, Boolean(prevState));
    const detectedFormat = this.detectRequestedFormat(userPrompt) || body?.requestedFormat || null;

    if (intent === 'greeting') {
      const content =
        'Halo! Saya AI Report Assistant Mitra10 Tukang untuk Admin HO dan Super User. Silakan ajukan permintaan data atau laporan, misalnya: (1) "Rekap order Juni sampai Oktober PDF", (2) "Evaluasi SP vendor Q2 2026", atau (3) "Laporan komisi sales bulan ini".';
      const resultPayload = {
        model: 'backend-greeting-handler',
        content,
        choices: [{ message: { role: 'assistant', content } }],
        aiMeta: {
          skillId: 'auto',
          skillName: 'Auto Skill',
          intent,
          requestedFormat: null,
          period: extractPeriodWib(userPrompt),
          promptChars: userPrompt.length,
          promptTokensEstimate: Math.ceil(userPrompt.length / 4),
          reportsFetched: [],
          unavailableRequested: [],
        },
      };
      return {
        ...resultPayload,
        data: resultPayload,
      };
    }

    if (intent === 'clarification') {
      const content =
        'Permintaan Anda belum spesifik. Apakah Anda ingin menganalisis: 1) Order & Omzet, 2) Quotation & Invoice, 3) Work Order & Jadwal, 4) Evaluasi SP Vendor, 5) Komplain & Refund, atau 6) Komisi Store? Silakan sebutkan jenis laporan dan periode yang Anda inginkan.';
      const resultPayload = {
        model: 'backend-clarification-guard',
        content,
        choices: [{ message: { role: 'assistant', content } }],
        aiMeta: {
          skillId: 'auto',
          skillName: 'Auto Skill',
          intent,
          requestedFormat: null,
          period: extractPeriodWib(userPrompt),
          promptChars: userPrompt.length,
          promptTokensEstimate: Math.ceil(userPrompt.length / 4),
          reportsFetched: [],
          unavailableRequested: [],
        },
      };
      return {
        ...resultPayload,
        data: resultPayload,
      };
    }

    if (intent === 'format_switch' && prevState?.lastDocument) {
      const targetFormat = detectedFormat || 'pdf';
      const docTitle = prevState.lastDocument.title;
      const docMarkdown = prevState.lastDocument.markdown;

      if (targetFormat === 'pdf' || targetFormat === 'word') {
        const content = `Format dokumen "${docTitle}" telah disesuaikan ke ${targetFormat.toUpperCase()}. File siap diunduh melalui tombol di bawah.\n\n<dokumen format="${targetFormat}" judul="${docTitle}">\n${docMarkdown}\n</dokumen>`;

        await this.sessionStateService.set(userId, sessionId, {
          ...prevState,
          lastDocument: {
            ...prevState.lastDocument,
            format: targetFormat,
          },
        });

        const resultPayload = {
          model: 'backend-format-switcher',
          content,
          choices: [{ message: { role: 'assistant', content } }],
          aiMeta: {
            skillId: prevState.lastSkillId,
            skillName: prevState.lastSkillId,
            intent,
            requestedFormat: targetFormat,
            period: prevState.lastPeriod,
            promptChars: userPrompt.length,
            promptTokensEstimate: Math.ceil(userPrompt.length / 4),
            reportsFetched: [],
            unavailableRequested: [],
          },
        };
        return {
          ...resultPayload,
          data: resultPayload,
        };
      }
    }

    const hasExplicitPeriod =
      /\b(q[1-4]|kuartal|januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|202[0-9]|bulan\s+(ini|lalu|kemarin|depan)|minggu\s+(ini|lalu)|hari\s+ini|kemarin|tahunan|semester)\b/i.test(
        userPrompt,
      );

    let period = extractPeriodWib(userPrompt);
    let skillIdToUse = body?.activeSkillId;

    if (intent === 'follow_up' && prevState) {
      skillIdToUse = prevState.lastSkillId;
      if (!hasExplicitPeriod && prevState.lastPeriod) {
        period = {
          date_from: prevState.lastPeriod.date_from || prevState.lastPeriod.from || '',
          date_to: prevState.lastPeriod.date_to || prevState.lastPeriod.to || '',
          quarter: prevState.lastPeriod.quarter || 1,
          year: prevState.lastPeriod.year || 2026,
          label: prevState.lastPeriod.label,
          isDefaultAssumption: Boolean(prevState.lastPeriod.isDefaultAssumption),
          assumptionNote: prevState.lastPeriod.assumptionNote || '',
        };
      }
    } else if (intent === 'comparison' && prevState && !hasDomainKeywords(userPrompt)) {
      skillIdToUse = prevState.lastSkillId;
    }

    const { effectiveSkill, matchedReadyReports, matchedUnavailableReports } = detectSkillAndReports(
      userPrompt,
      skillIdToUse,
    );

    const unavailableOnly =
      matchedUnavailableReports.length > 0 &&
      matchedReadyReports.every((r) => !r.keywords.some((kw) => userPrompt.toLowerCase().includes(kw)));

    const reportsToFetch = unavailableOnly ? [] : matchedReadyReports;

    const fetchedReports: FetchedCatalogReportPayload[] = [];
    for (const item of reportsToFetch) {
      const result = await this.fetchSingleCatalogReport(item, period, {}, user);
      fetchedReports.push(result);
    }

    let comparisonPeriod: ExtractedWibPeriod | undefined;
    let comparisonReports: FetchedCatalogReportPayload[] | undefined;
    if (intent === 'comparison' && prevState?.lastPeriod) {
      comparisonPeriod = {
        date_from: prevState.lastPeriod.date_from || prevState.lastPeriod.from || '',
        date_to: prevState.lastPeriod.date_to || prevState.lastPeriod.to || '',
        quarter: prevState.lastPeriod.quarter || 1,
        year: prevState.lastPeriod.year || 2026,
        label: prevState.lastPeriod.label,
        isDefaultAssumption: Boolean(prevState.lastPeriod.isDefaultAssumption),
        assumptionNote: prevState.lastPeriod.assumptionNote || '',
      };
      comparisonReports = [];
      for (const item of reportsToFetch) {
        const compResult = await this.fetchSingleCatalogReport(item, comparisonPeriod, {}, user);
        comparisonReports.push(compResult);
      }
    }

    const violationTypes =
      effectiveSkill.id === 'vendor_sp_and_performance' || effectiveSkill.id === 'quotation_and_billing_report'
        ? await this.getActiveViolationTypes()
        : DEFAULT_VENDOR_VIOLATION_TYPES;

    const systemPrompt = this.buildBackendSystemPrompt({
      intent,
      skill: effectiveSkill,
      period,
      requestedFormat: detectedFormat,
      fetchedReports,
      unavailableReports: matchedUnavailableReports,
      violationTypes,
      comparisonPeriod,
      comparisonReports,
    });

    const promptChars = systemPrompt.length + userPrompt.length;
    const promptTokensEstimate = Math.ceil(promptChars / 4);

    const telemetryMeta = {
      skillId: effectiveSkill.id,
      skillName: effectiveSkill.name,
      intent,
      requestedFormat: detectedFormat,
      period,
      promptChars,
      promptTokensEstimate,
      reportsFetched: fetchedReports.map((r) => ({
        key: r.key,
        title: r.title,
        sumber: r.meta.sumber,
        total: r.meta.total,
        ditampilkan: r.meta.ditampilkan,
        excludedTestCount: r.meta.excludedTestCount,
      })),
      unavailableRequested: matchedUnavailableReports.map((u) => ({
        key: u.key,
        title: u.title,
        status: 'belum tersedia',
        reason: u.unavailableReason,
      })),
    };

    const persistSessionState = async (replyText: string, executedSql?: string, rowCount?: number) => {
      const docMatch = /<dokumen\b([^>]*)>([\s\S]*?)(?:<\/dokumen>|$)/i.exec(replyText);
      let lastDocument = prevState?.lastDocument;
      if (docMatch) {
        const rawFmt = docMatch[1].match(/format\s*=\s*["']?([^"'\s>]+)["']?/i)?.[1] || 'pdf';
        const rawJudul = docMatch[1].match(/judul\s*=\s*["']([^"']+)["']/i)?.[1] || effectiveSkill.name;
        lastDocument = {
          title: rawJudul.trim(),
          format: (rawFmt === 'excel' || rawFmt === 'word' ? rawFmt : 'pdf') as any,
          markdown: docMatch[2].trim(),
        };
      }

      const keyFigures: Record<string, any> = {};
      for (const rep of fetchedReports) {
        keyFigures[rep.key] = {
          title: rep.title,
          total: rep.meta?.total || 0,
          aggregates: rep.aggregates,
        };
      }
      if (executedSql) {
        keyFigures['dynamic_sql'] = {
          sql: executedSql,
          rowCount: rowCount ?? 0,
        };
      }

      await this.sessionStateService.set(userId, sessionId, {
        lastSkillId: effectiveSkill.id,
        lastPeriod: {
          from: period.date_from,
          to: period.date_to,
          date_from: period.date_from,
          date_to: period.date_to,
          label: period.label,
          quarter: period.quarter,
          year: period.year,
          isDefaultAssumption: period.isDefaultAssumption,
          assumptionNote: period.assumptionNote,
        },
        lastReportKeys: reportsToFetch.map((r) => r.key),
        filters: {},
        keyFigures,
        fetchedAt: new Date().toISOString(),
        ...(lastDocument ? { lastDocument } : {}),
      });
    };

    if (upstreamConfig.engineMode === 'local-analyst') {
      const content = this.buildDeterministicReply({
        intent,
        skill: effectiveSkill,
        period,
        requestedFormat: detectedFormat,
        fetchedReports,
        unavailableReports: matchedUnavailableReports,
      });
      await persistSessionState(content);
      const resultPayload = {
        model: 'mitra10-local-analyst',
        content,
        choices: [{ message: { role: 'assistant', content } }],
        aiMeta: telemetryMeta,
      };
      return {
        ...resultPayload,
        data: resultPayload,
      };
    }

    const isRevision = isRevisionPrompt(userPrompt);
    const rawHistory = Array.isArray(body?.history) ? body.history : [];
    let lastDocIdx = -1;
    if (isRevision) {
      for (let i = rawHistory.length - 1; i >= 0; i--) {
        if (rawHistory[i]?.role === 'assistant' && /<dokumen\b/i.test(rawHistory[i].content || '')) {
          lastDocIdx = i;
          break;
        }
      }
    }

    const sanitizedHistory = rawHistory
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-8)
      .map((m, idx) => {
        if (isRevision && idx === lastDocIdx) {
          return { role: m.role, content: m.content.trim() };
        }
        return {
          role: m.role,
          content: m.content.replace(/<dokumen[\s\S]*?(?:<\/dokumen>|$)/gi, '[Dokumen lampiran sebelumnya]').trim(),
        };
      });

    const messages = [
      { role: 'system', content: systemPrompt },
      ...sanitizedHistory,
      { role: 'user', content: userPrompt },
    ];

    const { baseUrl, apiKey, model, temperature, maxTokens } = upstreamConfig;

    const upstreamPayload: Record<string, any> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    };

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(upstreamPayload),
      });

      if (response.ok) {
        const json: any = await response.json();
        const content = json?.choices?.[0]?.message?.content || '';

        // Dynamic Text-to-SQL handling
        const sqlMatch = content.match(/<sql>([\s\S]*?)<\/sql>/i);
        if (sqlMatch) {
          let rawSql = sqlMatch[1].trim();
          this.logger.log(`Executing AI-generated SQL query: ${rawSql}`);
          let sqlResult = await this.sqlExecutorService.executeReadOnlySql(rawSql);

          // Self-Healing Retry: Jika query pertama gagal karena kesalahan nama kolom/sintaks, coba perbaikan otomatis
          if (!sqlResult.success) {
            this.logger.warn(`Query AI SQL gagal (${sqlResult.error}). Mencoba perbaikan otomatis (self-healing query)...`);
            const retryPrompt = [
              `Query T-SQL Anda sebelumnya gagal dieksekusi oleh Microsoft SQL Server dengan pesan error:`,
              `"${sqlResult.error}"`,
              `Query yang gagal: \`${rawSql}\``,
              '',
              'INSTRUKSI PERBAIKAN:',
              '1. Periksa kembali SKEMA dan PETA RELASI antar tabel (ingat: kolom yang tidak ada di suatu tabel harus dihubungkan melalui relasi/JOIN, misalnya quotation TIDAK punya vendor_id langsung melainkan JOIN orders ON quotation.order_id = orders.id JOIN vendor ON orders.vendor_id = vendor.id; komplain ke toko: JOIN orders o ON c.order_id = o.id JOIN store s ON o.store_id = s.id; invoices vendor: invoices.vendorId; tukang nama: tukang.full_name; vendor nama: vendor.company_name; toko nama: store.store_name).',
              '2. Tuliskan query T-SQL yang sudah diperbaiki di dalam tag <sql>SELECT ...</sql>. DILARANG menanyakan struktur kolom atau relasi kepada pengguna.',
              '',
              this.sqlExecutorService.getDatabaseSchemaPrompt(),
            ].join('\n');

            try {
              const retryResponse = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                },
                body: JSON.stringify({
                  model,
                  messages: [
                    ...messages,
                    { role: 'assistant', content },
                    { role: 'user', content: retryPrompt },
                  ],
                  temperature: 0.1,
                  max_tokens: maxTokens,
                  stream: false,
                }),
              });

              if (retryResponse.ok) {
                const retryJson: any = await retryResponse.json();
                const retryContent = retryJson?.choices?.[0]?.message?.content || '';
                const retrySqlMatch = retryContent.match(/<sql>([\s\S]*?)<\/sql>/i);
                if (retrySqlMatch) {
                  const retrySql = retrySqlMatch[1].trim();
                  this.logger.log(`Executing corrected SQL query: ${retrySql}`);
                  const retryResult = await this.sqlExecutorService.executeReadOnlySql(retrySql);
                  if (retryResult.success) {
                    this.logger.log('Self-healing SQL execution BERHASIL!');
                    rawSql = retrySql;
                    sqlResult = retryResult;
                  }
                }
              }
            } catch (retryErr) {
              this.logger.warn(`Self-healing retry call gagal: ${(retryErr as Error)?.message}`);
            }
          }

          let secondPassContent = content;
          const executedTelemetry: { executedSql?: string; rowsFound?: number } = {
            executedSql: sqlResult.sql,
            rowsFound: sqlResult.rowCount,
          };

          if (sqlResult.success) {
            const returnedRows = sqlResult.rows || [];
            const displayRows = returnedRows.slice(0, 50);
            const dataNotice = [
              `Berikut adalah DATA AKTUAL dari database hasil eksekusi query Anda:`,
              `- Query: \`${sqlResult.sql}\``,
              `- Total baris ditemukan: ${sqlResult.rowCount} baris (ditampilkan ${displayRows.length} baris sampel di bawah)`,
              '```json',
              JSON.stringify(displayRows, null, 2),
              '```',
              '',
              'INSTRUKSI FINAL:',
              '1. Jawab pertanyaan pengguna secara lengkap, terstruktur, ramah, dan akurat berdasarkan data nyata di atas.',
              '2. Format angka mata uang Rupiah (misal Rp 1.500.000) dan tanggal Indonesia.',
              '3. DILARANG mengarang angka atau data di luar hasil query.',
              detectedFormat
                ? `4. Pengguna meminta format ${detectedFormat.toUpperCase()}. Sertakan dokumen lengkap di dalam tag <dokumen format="${detectedFormat}" judul="...">...markdown...</dokumen>. Sapaan/chat pengantar maksimal 4 kalimat.`
                : intent === 'new_report'
                  ? '4. Buatkan ringkasan temuan di CHAT (maksimal 4 kalimat) dan lampirkan laporan lengkap dalam tag <dokumen format="pdf" judul="...">...markdown...</dokumen>.'
                  : '4. Sajikan jawaban di CHAT secara jelas dan profesional (tabel markdown ringkas diperbolehkan).',
            ].join('\n');

            const secondMessages = [
              ...messages,
              { role: 'assistant', content },
              { role: 'user', content: dataNotice },
            ];

            try {
              const secondResponse = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                },
                body: JSON.stringify({
                  model,
                  messages: secondMessages,
                  temperature: 0.2,
                  max_tokens: maxTokens,
                  stream: false,
                }),
              });

              if (secondResponse.ok) {
                const secondJson: any = await secondResponse.json();
                const finalContent = secondJson?.choices?.[0]?.message?.content || '';
                if (finalContent.trim()) {
                  secondPassContent = finalContent;
                }
              }
            } catch (secondErr) {
              this.logger.warn(`Second-pass LLM call gagal: ${(secondErr as Error)?.message}`);
            }
          } else {
            this.logger.warn(`Query AI SQL gagal: ${sqlResult.error}`);
            const errorNotice = `Data untuk kriteria tersebut belum dapat ditemukan atau query mengalami kendala teknis. Sampaikan permintaan maaf secara ramah kepada pengguna tanpa menanyakan detail teknis skema kolom database kepada pengguna.`;
            try {
              const secondResponse = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                },
                body: JSON.stringify({
                  model,
                  messages: [
                    ...messages,
                    { role: 'assistant', content },
                    { role: 'user', content: errorNotice },
                  ],
                  temperature: 0.2,
                  max_tokens: maxTokens,
                  stream: false,
                }),
              });

              if (secondResponse.ok) {
                const secondJson: any = await secondResponse.json();
                const finalContent = secondJson?.choices?.[0]?.message?.content || '';
                if (finalContent.trim()) {
                  secondPassContent = finalContent;
                }
              }
            } catch (secondErr) {
              this.logger.warn(`Second-pass error notice call gagal: ${(secondErr as Error)?.message}`);
            }
          }

          await persistSessionState(secondPassContent, sqlResult.sql, sqlResult.rowCount);
          const resultPayload = {
            ...json,
            content: secondPassContent,
            choices: [{ message: { role: 'assistant', content: secondPassContent } }],
            aiMeta: {
              ...telemetryMeta,
              ...executedTelemetry,
            },
          };
          return {
            ...resultPayload,
            data: resultPayload,
          };
        }

        if (content.trim()) {
          await persistSessionState(content);
          const resultPayload = {
            ...json,
            content,
            aiMeta: telemetryMeta,
          };
          return {
            ...resultPayload,
            data: resultPayload,
          };
        }
        this.logger.warn(`Upstream LLM (${baseUrl}) mengembalikan content kosong; memakai fallback deterministik.`);
      } else {
        this.logger.warn(`Upstream LLM (${baseUrl}) merespons status ${response.status}; memakai fallback deterministik.`);
      }
    } catch (err) {
      this.logger.warn(`Upstream LLM (${baseUrl}) tidak terjangkau (${(err as Error)?.message}); memakai fallback deterministik.`);
    }

    const fallbackContent = this.buildDeterministicReply({
      intent,
      skill: effectiveSkill,
      period,
      requestedFormat: detectedFormat,
      fetchedReports,
      unavailableReports: matchedUnavailableReports,
    });

    await persistSessionState(fallbackContent);

    const fallbackPayload = {
      model: 'backend-deterministic-fallback',
      content: fallbackContent,
      choices: [{ message: { role: 'assistant', content: fallbackContent } }],
      aiMeta: telemetryMeta,
    };

    return {
      ...fallbackPayload,
      data: fallbackPayload,
    };
  }
}
