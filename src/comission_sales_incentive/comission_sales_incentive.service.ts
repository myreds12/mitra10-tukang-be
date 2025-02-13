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
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';

@Injectable()
export class ComissionSalesIncentiveService {
  constructor(
    private readonly dbService: PrismaService,
    private pdfService: PdfService,
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
    try {
      const data = await this.dbService.comission_sales_incentive.findFirst({
        where: {
          deleted_at: null,
          deleted_by: null,
          id: id,
        },
        include: {
          sales_incentive: {
            where: {
              deleted_at: null,
            },
            include: {
              sales: {
                include: {
                  bank: true,
                  store: true,
                },
              },
              quotation: {
                include: {
                  order: {
                    include: {
                      members: true,
                      m_order_details: {
                        where: {
                          deleted_at: null,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet(
        'Data Comission Sales Incentive',
        {
          properties: {
            tabColor: { argb: '097969' },
          },
          pageSetup: {
            margins: {
              left: 0.7,
              right: 0.7,
              top: 0.75,
              bottom: 0.75,
              header: 0.3,
              footer: 0.3,
            },
          },
        },
      );

      worksheet.mergeCells('A2: N3');

      worksheet.getCell('A2').value = `DATA SALES INCENTIVE`;
      worksheet.getCell('A2').font = { size: 16, bold: true };
      worksheet.getCell('A2').alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };

      worksheet.columns = [
        { header: 'No', key: 'no', width: 10 },
        { header: 'Store Name', key: 'store_name', width: 30 },
        { header: 'NIK', key: 'nik', width: 12 },
        { header: 'Nama Lengkap', key: 'sales_name', width: 30 },
        { header: 'Divisi/Brand', key: 'sales_brand', width: 23 },
        { header: 'No. Rekening', key: 'sales_account_number', width: 15 },
        { header: 'Bank', key: 'sales_bank', width: 15 },
        { header: 'Customer Name', key: 'member_name', width: 30 },
        { header: 'Nomor Receipt', key: 'no_receipt', width: 15 },
        { header: 'Jenis Pengerjaan', key: 'item_name', width: 35 },
        { header: 'Installation Fee', key: 'instalation_fee', width: 15 },
        { header: 'Insentif', key: 'sales_incentive', width: 15 },
      ];

      const headerRow = worksheet.addRow(
        worksheet.columns.map((col) => col.header),
      );
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4CAF50' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
      headerRow.height = 35;

      worksheet.getCell('A1').value = null;

      worksheet.getRow(1).eachCell((cell) => {
        cell.value = null;
      });

      data.sales_incentive.forEach((item, index) => {
        const receipt_number = item.quotation.receipt_quotation
          ? item.quotation.receipt_quotation
          : item.quotation.order.receipt_number;

        const row = worksheet.addRow({
          no: index + 1,
          store_name: item.sales.store.store_name,
          nik: item.sales.nik || '',
          sales_name: item.sales.full_name,
          sales_brand: item.sales.sales_brand || '',
          sales_account_number: item?.sales?.account_number ?? '',
          sales_bank: item?.sales?.bank?.bank_name ?? '',
          member_name: item?.quotation?.order?.members?.full_name ?? '',
          no_receipt: receipt_number,
          item_name: item.quotation?.order?.m_order_details?.map(
            (x) => x?.item_name || '-',
          ),
          instalation_fee: Number(item.quotation.quotation_grand_total),
          sales_incentive: Number(item.nominal),
        });

        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };

          if (colNumber === 4) {
            cell.alignment = { horizontal: 'left' };
          } else {
            cell.alignment = { horizontal: 'left' };
          }
        });
      });

      const totalsRow = worksheet.addRow({
        no: '',
        store_name: '',
        nik: '',
        sales_name: '',
        sales_brand: '',
        sales_account_number: '',
        sales_bank: '',
        member_name: '',
        no_receipt: '',
        item_name: 'Total',
        instalation_fee: data.sales_incentive.reduce(
          (acc, curr) => acc + Number(curr?.quotation.quotation_grand_total),
          0,
        ),
        sales_incentive: data.sales_incentive.reduce(
          (acc, curr) => acc + Number(curr?.nominal),
          0,
        ),
      });

      worksheet.mergeCells(`A${totalsRow.number}:E${totalsRow.number}`);
      totalsRow.getCell('A').alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };

      totalsRow.eachCell((cell, colNumber) => {
        if (colNumber > 1) {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }

        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });

      const getFormattedDate = () => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
          2,
          '0',
        )}-${String(now.getDate()).padStart(2, '0')}`;
      };

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/comission-sales-incentive';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const excelFileName = `${baseName}-${Date.now()}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      const writeWorkbookAndSendResponse = async (
        workbook: exceljs.Workbook,
        excelFilePath: string,
        res: Response,
      ) => {
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
      };

      const generateExcelFile = async (res) => {
        const formattedDate = getFormattedDate();
        const baseName = `DataComissionSalesIncentiveId${id}-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);
        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(res);
    } catch (error) {
      console.error(error);
      res.status(500).send('An error occurred while generating the invoice.');
    }
  }

  async comissionSalesIncentiveExportPdf(id: number, res: Response) {
    const data = await this.dbService.comission_sales_incentive.findFirst({
      where: {
        deleted_at: null,
        deleted_by: null,
        id: id,
      },
      include: {
        sales_incentive: {
          where: {
            deleted_at: null,
          },
          include: {
            sales: {
              include: {
                bank: true,
                store: true,
              },
            },
            quotation: {
              include: {
                order: {
                  include: {
                    members: true,
                    m_order_details: {
                      where: {
                        deleted_at: null,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!data) {
      console.error('Comission Sales Incentive not found!');
      throw new NotFoundException('Comission Sales Incentive not found!');
    }

    const buffer = await this.pdfService.generateLandscape(
      'comission-sales-incentive-pdf',
      data,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=comission-sales-incentive.pdf',
    );
    res.send(buffer);
  }

  async comissionSalesIncentiveExportExcel(
    query: QueryParamsDto,
    res: Response,
  ) {
    try {
      const { search, date_from, date_to, order_by, monthly, status } = query;
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
      const data = await this.dbService.comission_sales_incentive.findMany({
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

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet(
        'Data Comission Sales Incentive',
        {
          properties: {
            tabColor: { argb: '097969' },
          },
          pageSetup: {
            margins: {
              left: 0.7,
              right: 0.7,
              top: 0.75,
              bottom: 0.75,
              header: 0.3,
              footer: 0.3,
            },
          },
        },
      );

      worksheet.mergeCells('A2: N3');

      worksheet.getCell('A2').value = `REKAP DATA INCENTIVE `;
      worksheet.getCell('A2').font = { size: 16, bold: true };
      worksheet.getCell('A2').alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };

      worksheet.columns = [
        { header: 'No', key: 'no', width: 10 },
        { header: 'Incentive ID', key: 'incentive_id', width: 25 },
        { header: 'Tanggal Pengajuan', key: 'created_at', width: 17 },
        { header: 'Status Insentif', key: 'status', width: 30 },
        { header: 'Grand Total \n Insentif', key: 'grand_total', width: 25 },
      ];
      const headerRow = worksheet.addRow(
        worksheet.columns.map((col) => col.header),
      );
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4CAF50' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
      headerRow.height = 35;

      worksheet.getCell('A1').value = null;

      worksheet.getRow(1).eachCell((cell) => {
        cell.value = null;
      });

      data.forEach((item, index) => {
        const row = worksheet.addRow({
          no: index + 1,
          incentive_id: item.sales_incentive.map((x) => x.id)[0] ?? '',
          created_at: new Date(item.created_at).toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          status: IncentiveStatus[item.status],
          grand_total: Number(item.total_amount),
        });

        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };

          if (colNumber === 4) {
            cell.alignment = { horizontal: 'left' };
          } else {
            cell.alignment = { horizontal: 'left' };
          }
        });
      });

      const totalsRow = worksheet.addRow({
        no: 'Total',
        incentive_id: '',
        created_at: '',
        status: '',
        grand_total: data.reduce(
          (acc, curr) => acc + Number(curr.total_amount),
          0,
        ),
      });

      worksheet.mergeCells(`A${totalsRow.number}:D${totalsRow.number}`);
      totalsRow.getCell('A').alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };

      totalsRow.eachCell((cell, colNumber) => {
        if (colNumber > 1) {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }

        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });

      const getFormattedDate = () => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
          2,
          '0',
        )}-${String(now.getDate()).padStart(2, '0')}`;
      };

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/comission-sales-incentive';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const excelFileName = `${baseName}-${Date.now()}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      const writeWorkbookAndSendResponse = async (
        workbook: exceljs.Workbook,
        excelFilePath: string,
        res: Response,
      ) => {
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
      };

      const generateExcelFile = async (res) => {
        const formattedDate = getFormattedDate();
        const baseName = `DataComissionSalesIncentive-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);
        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(res);
    } catch (error) {
      console.error(error);
      res.status(500).send('An error occurred while generating the invoice.');
    }
  }
}
