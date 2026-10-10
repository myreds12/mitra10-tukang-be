import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateComissionSalesIncentiveDto } from './dto/create-comission_sales_incentive.dto';
import { UpdateComissionSalesIncentiveDto } from './dto/update-comission_sales_incentive.dto';
import { Prisma, users } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { Response } from 'express';
import { PdfService } from 'src/common/service/pdf.service';
import { ComissionSalesIncentiveExportService } from './comission_sales_incentive_export.service';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';

@Injectable()
export class ComissionSalesIncentiveService {
  constructor(
    private readonly dbService: PrismaService,
    private pdfService: PdfService,
    private readonly exportService: ComissionSalesIncentiveExportService,
  ) {}
  async create(
    createComissionSalesIncentiveDto: CreateComissionSalesIncentiveDto,
    user: users,
    comission_sales_incentive_evidences: Express.Multer.File[],
  ) {
    try {
      const evidences =
        comission_sales_incentive_evidences.length > 0
          ? comission_sales_incentive_evidences?.map((item) => {
              return {
                evidence_location: item.filename,
                created_by: user.id,
              };
            })
          : [];

      const salesIncentiveUpdateArgs =
        createComissionSalesIncentiveDto.sales_incentive.length > 0
          ? createComissionSalesIncentiveDto.sales_incentive.map(
              (item) => item.sales_incentive_id,
            )
          : undefined;
      const salesIncentiveTotalAmount = await this.dbService.sales_incentive
        .findMany({
          where: {
            id: {
              in: salesIncentiveUpdateArgs,
            },
          },
        })
        .then((data) =>
          data.reduce((acc, curr) => acc + Number(curr?.nominal), 0),
        );
      const [comissionSalesIncentive] = await this.dbService.$transaction([
        this.dbService.comission_sales_incentive.create({
          data: {
            total_amount: salesIncentiveTotalAmount,
            status: createComissionSalesIncentiveDto.status,
            created_by: user.id,
            comission_sales_incentive_evidence: {
              createMany: {
                data: evidences,
              },
            },
          },
          include: {
            sales_incentive: {
              include: {
                quotation: {
                  include: {
                    order: true,
                  },
                },
              },
            },
          },
        }),
      ]);
      await this.dbService.sales_incentive.updateMany({
        where: {
          id: {
            in: salesIncentiveUpdateArgs,
          },
        },
        data: {
          comission_sales_incentive_id: comissionSalesIncentive.id,
        },
      });
      return comissionSalesIncentive;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const {
        page,
        take,
        search,
        date_from,
        date_to,
        order_by,
        monthly,
        status,
      } = query;
      const skip = page * take - take;
      const now = new Date();
      if (monthly) now.setFullYear(monthly);
      const where: Prisma.comission_sales_incentiveScalarWhereWithAggregatesInput =
        {
          AND: [
            ...(search
              ? [
                  {
                    OR: [
                      {
                        id: !isNaN(+search) ? +search : undefined,
                      },
                    ],
                  },
                  {
                    sales_incentive: {
                      some: {
                        sales: {
                          OR: [
                            {
                              id: !isNaN(+search) ? +search : undefined,
                            },
                            { full_name: { contains: search } },
                            { sales_brand: { contains: search } },
                            { account_name: { contains: search } },
                            { phone_number: { contains: search } },
                            { account_number: { contains: search } },
                            { nik: { contains: search } },
                            { bank_branch: { contains: search } },
                            {
                              sales_categories: {
                                some: {
                                  categories: {
                                    category_name: { contains: search },
                                  },
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                ]
              : []),
            ...(status
              ? [
                  {
                    status: status[0],
                  },
                ]
              : []),
            date_from && date_to
              ? {
                  created_at: {
                    gte: new Date(`${date_from}T00:00:00.000Z`),
                    lte: new Date(`${date_to}T23:59:59.000Z`),
                  },
                }
              : undefined,
            monthly
              ? {
                  created_at: {
                    gte: new Date(now.getFullYear(), 0, 1),
                    lte: new Date(now.getFullYear(), 11, 31),
                  },
                }
              : undefined,
          ].filter(Boolean),
          deleted_at: null,
        };
      const comissionSalesIncentive =
        await this.dbService.comission_sales_incentive.findMany({
          skip,
          take: take <= 0 ? undefined : take,
          where,
          orderBy: {
            created_at: order_by,
          },
          include: {
            comission_sales_incentive_evidence: {
              where: {
                deleted_at: null,
              },
            },
            sales_incentive: {
              where: {
                deleted_at: null,
              },
              include: {
                incentive: true,
                quotation: {
                  include: {
                    quotation_details: {
                      where: {
                        deleted_at: null,
                      },
                    },
                    promotion: true,
                    order: {
                      include: {
                        m_order_details: {
                          where: {
                            deleted_at: null,
                          },
                          include: {
                            item: true,
                          },
                        },
                      },
                    },
                  },
                },
                sales: {
                  include: {
                    store: true,
                    bank: true,
                  },
                },
              },
            },
          },
        });

      const count = await this.dbService.comission_sales_incentive.count();
      return {
        data: comissionSalesIncentive,
        meta: {
          total: count,
          page,
          take,
          takeTotal: comissionSalesIncentive.length,
        },
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const comissionSalesIncentive =
        await this.dbService.comission_sales_incentive.findFirst({
          where: {
            id,
          },
          include: {
            comission_sales_incentive_evidence: {
              where: {
                deleted_at: null,
              },
            },
            sales_incentive: {
              where: {
                deleted_at: null,
              },
              include: {
                incentive: true,
                quotation: {
                  include: {
                    quotation_details: {
                      where: {
                        deleted_at: null,
                      },
                    },
                    promotion: true,
                    order: {
                      include: {
                        m_order_details: {
                          where: {
                            deleted_at: null,
                          },
                          include: {
                            item: true,
                          },
                        },
                      },
                    },
                  },
                },
                sales: {
                  include: {
                    store: true,
                    bank: true,
                  },
                },
              },
            },
          },
        });
      return comissionSalesIncentive;
    } catch (error) {
      throw error;
    }
  }

  async update(
    id: number,
    updateComissionSalesIncentiveDto: UpdateComissionSalesIncentiveDto,
    comission_sales_incentive_evidences: Express.Multer.File[],
    user: users,
  ) {
    try {
      const existingSalesIncentives =
        await this.dbService.sales_incentive.findMany({
          where: {
            comission_sales_incentive_id: id,
          },
          select: {
            id: true,
          },
        });

      const existingSalesIncentiveIds = existingSalesIncentives.map(
        (item) => item.id,
      );

      const newSalesIncentiveIds =
        updateComissionSalesIncentiveDto?.sales_incentive?.map(
          (item) => item?.sales_incentive_id,
        ) || [];

      const salesIncentiveIdsToDisconnect = existingSalesIncentiveIds.filter(
        (existingId) => !newSalesIncentiveIds.includes(existingId),
      );

      const salesIncentiveIdsToConnect = newSalesIncentiveIds.filter(
        (newId) => !existingSalesIncentiveIds.includes(newId),
      );

      const evidences =
        comission_sales_incentive_evidences.length > 0
          ? comission_sales_incentive_evidences.map((item) => {
              return {
                evidence_location: item.filename,
                created_by: user.id,
              };
            })
          : [];

      const salesIncentiveTotalAmount = await this.dbService.sales_incentive
        .findMany({
          where: {
            id: {
              in:
                newSalesIncentiveIds.length > 0
                  ? newSalesIncentiveIds
                  : existingSalesIncentiveIds,
            },
          },
        })
        .then((data) =>
          data.reduce((acc, curr) => acc + Number(curr?.nominal), 0),
        );

      const [comissionSalesIncentive] = await this.dbService.$transaction([
        this.dbService.comission_sales_incentive.update({
          where: { id },
          data: {
            total_amount: salesIncentiveTotalAmount,
            status: updateComissionSalesIncentiveDto.status,
            updated_by: user.id,
            comission_sales_incentive_evidence: {
              createMany: {
                data: evidences,
              },
            },
            ...(updateComissionSalesIncentiveDto.status === 3
              ? {
                  sales_incentive: {
                    updateMany: {
                      where: {
                        comission_sales_incentive_id: id,
                      },
                      data: {
                        status: IncentiveStatus.DITOLAK,
                      },
                    },
                  },
                }
              : undefined),
          },
        }),
        ...(salesIncentiveIdsToConnect.length > 0
          ? [
              this.dbService.sales_incentive.updateMany({
                where: { id: { in: salesIncentiveIdsToDisconnect } },
                data: { comission_sales_incentive_id: null },
              }),
            ]
          : []),

        ...(salesIncentiveIdsToConnect.length > 0
          ? [
              this.dbService.sales_incentive.updateMany({
                where: { id: { in: salesIncentiveIdsToConnect } },
                data: { comission_sales_incentive_id: id },
              }),
            ]
          : []),
      ]);

      return comissionSalesIncentive;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  remove(id: number) {
    return `This action removes a #${id} comissionSalesIncentive`;
  }

  async nextCode() {
    const invoices = await this.dbService.comission_sales_incentive.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    let nextCode: number;
    if (invoices[0]) {
      nextCode = invoices[0].id + 1;
    } else {
      nextCode = 0 + 1;
    }

    return {
      code: nextCode,
    };
  }

  async comissionSalesIncentiveDetailExportExcel(id: number, res: Response) {
    return this.exportService.comissionSalesIncentiveDetailExportExcel(id, res);
  }

  async comissionSalesIncentiveExportPdf(id: number, res: Response) {
    return this.exportService.comissionSalesIncentiveExportPdf(id, res);
  }

  async comissionSalesIncentiveExportExcel(
    query: QueryParamsDto,
    res: Response,
  ) {
    return this.exportService.comissionSalesIncentiveExportExcel(query, res);
  }
}
