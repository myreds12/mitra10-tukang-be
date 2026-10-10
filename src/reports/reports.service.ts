/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Response } from 'express';
import { ReportsCommissionService } from './reports-commission.service';
import { ReportsOrderService } from './reports-order.service';
import { ReportsOperationsService } from './reports-operations.service';
import { ReportsGeneralService } from './reports-general.service';
import { ReportsAnalyticsService } from './reports-analytics.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly commissionService: ReportsCommissionService,
    private readonly orderService: ReportsOrderService,
    private readonly operationsService: ReportsOperationsService,
    private readonly generalService: ReportsGeneralService,
    private readonly analyticsService: ReportsAnalyticsService,
  ) {}

  async salesComissionReport(query: QueryParamsDto) {
    return this.commissionService.salesComissionReport(query);
  }

  async storeComissionReport(query: QueryParamsDto) {
    return this.commissionService.storeComissionReport(query);
  }

  async reportOrder(query: QueryParamsDto) {
    return this.orderService.reportOrder(query);
  }

  async reportComplaint(query: QueryParamsDto) {
    return this.operationsService.reportComplaint(query);
  }

  async reportWorkOrder(query: QueryParamsDto) {
    return this.orderService.reportWorkOrder(query);
  }

  async reportTukang(query: QueryParamsDto) {
    return this.operationsService.reportTukang(query);
  }

  async reportVendor() {
    return this.operationsService.reportVendor();
  }

  async generalReport(queryParams: QueryParamsDto, res: Response) {
    return this.generalService.generalReport(queryParams, res);
  }

  async daerahTerlarisReport(params: {
    orderYear?: string;
    orderMonth?: string;
    invoiceYear?: string;
    invoiceMonth?: string;
  } = {}) {
    return this.analyticsService.daerahTerlarisReport(params);
  }

  async tokoJasaInstalasiReport(params: {
    orderYear?: string;
    orderMonth?: string;
    invoiceYear?: string;
    invoiceMonth?: string;
  } = {}) {
    return this.analyticsService.tokoJasaInstalasiReport(params);
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
    return this.analyticsService.exportDaerahTokoExcel(res, params);
  }

  async orderDetailReport(params: {
    orderYear?: string;
    orderMonth?: string;
    invoiceYear?: string;
    invoiceMonth?: string;
  } = {}) {
    return this.analyticsService.orderDetailReport(params);
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
    return this.analyticsService.exportOrderDetailExcel(res, params);
  }
}
