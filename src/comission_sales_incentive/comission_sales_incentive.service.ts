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

@Injectable()
export class ComissionSalesIncentiveService {
  constructor(private readonly dbService: PrismaService, private pdfService: PdfService) { }
  async create(createComissionSalesIncentiveDto: CreateComissionSalesIncentiveDto, user: users, comission_sales_incentive_evidences: Express.Multer.File[]) {
    try {
      const evidences = comission_sales_incentive_evidences.length > 0 ? comission_sales_incentive_evidences?.map((item) => {
        console.log(item);

        return {
          evidence_location: item.filename,
          created_by: user.id,
        }
      }) : [];

      console.log(evidences);


      console.log((await this.nextCode()).code)
      const salesIncentiveUpdateArgs = createComissionSalesIncentiveDto.sales_incentive.length > 0 ? createComissionSalesIncentiveDto.sales_incentive.map((item) => item.sales_incentive_id) : undefined;
      console.log(salesIncentiveUpdateArgs)
      const salesIncentiveTotalAmount = await this.dbService.sales_incentive.findMany({
        where: {
          id: {
            in: salesIncentiveUpdateArgs
          }
        }
      }).then((data) => data.reduce((acc, curr) => acc + Number(curr?.nominal), 0));
      const [comissionSalesIncentive, updateSalesIncentive] = await this.dbService.$transaction([
        this.dbService.comission_sales_incentive.create({
          data: {
            total_amount: salesIncentiveTotalAmount,
            status: createComissionSalesIncentiveDto.status,
            created_by: user.id,
            comission_sales_incentive_evidence: {
              createMany: {
                data: evidences
              }
            }
          },
        }),
        this.dbService.sales_incentive.updateMany({
          where: {
            id: {
              in: salesIncentiveUpdateArgs
            }
          },
          data: {
            comission_sales_incentive_id: (await this.nextCode()).code
          }
        })
      ]);
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
        vendor_id,
        monthly,
        status,
        invoice_status,
      } = query;
      const skip = page * take - take;
      const now = new Date();
      if (monthly) now.setFullYear(monthly);
      const where: Prisma.comission_sales_incentiveScalarWhereWithAggregatesInput = {
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
                              categories: { category_name: { contains: search } },
                            },
                          },
                        },
                      ]
                    }
                  }
                }
              }
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
      const comissionSalesIncentive = await this.dbService.comission_sales_incentive.findMany({
        skip,
        take: take <= 0 ? undefined : take,
        where,
        orderBy: {
          created_at: order_by,
        },
        include: {
          comission_sales_incentive_evidence: {
            where: {
              deleted_at: null
            }
          },
          sales_incentive: {
            where: {
              deleted_at: null
            },
            include: {
              incentive: true,
              quotation: {
                include: {
                  quotation_details: {
                    where: {
                      deleted_at: null
                    },
                  },
                  promotion: true,
                  order: {
                    include: {
                      m_order_details: {
                        where: {
                          deleted_at: null
                        },
                        include: {
                          item: true
                        }
                      }
                    }
                  }
                }
              },
              sales: {
                include: {
                  store: true,
                  bank: true,
                }
              }
            }
          }
        }
      });

      const count = await this.dbService.comission_sales_incentive.count();
      return {
        data: comissionSalesIncentive,
        meta: {
          total: count,
          page,
          take,
          takeTotal: comissionSalesIncentive.length,
        }
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const comissionSalesIncentive = await this.dbService.comission_sales_incentive.findFirst({
        where: {
          id
        },
        include: {
          comission_sales_incentive_evidence: {
            where: {
              deleted_at: null
            }
          },
          sales_incentive: {
            where: {
              deleted_at: null
            },
            include: {
              incentive: true,
              quotation: {
                include: {
                  quotation_details: {
                    where: {
                      deleted_at: null
                    },
                  },
                  promotion: true,
                  order: {
                    include: {
                      m_order_details: {
                        where: {
                          deleted_at: null
                        },
                        include: {
                          item: true
                        }
                      }
                    }
                  }
                }
              },
              sales: {
                include: {
                  store: true,
                  bank: true,
                }
              }
            }
          }
        }
      });
      return comissionSalesIncentive;
    } catch (error) {
      throw error;
    }
  }

  async update(
    id: number, // ID dari comission_sales_incentive yang ingin di-update
    updateComissionSalesIncentiveDto: UpdateComissionSalesIncentiveDto,
    comission_sales_incentive_evidences: Express.Multer.File[],
    user: users,
  ) {
    try {
      // Fetch existing sales_incentive_ids linked to the current comission_sales_incentive
      const existingSalesIncentives = await this.dbService.sales_incentive.findMany({
        where: {
          comission_sales_incentive_id: id,
        },
        select: {
          id: true
        }
      });

      const existingSalesIncentiveIds = existingSalesIncentives.map(item => item.id);

      const newSalesIncentiveIds = updateComissionSalesIncentiveDto.sales_incentive.map(item => item.sales_incentive_id);

      const salesIncentiveIdsToDisconnect = existingSalesIncentiveIds.filter(id => !newSalesIncentiveIds.includes(id));

      const salesIncentiveIdsToConnect = newSalesIncentiveIds.filter(id => !existingSalesIncentiveIds.includes(id));

      const evidences = comission_sales_incentive_evidences.length > 0 ? comission_sales_incentive_evidences.map((item) => {
        return {
          evidence_location: item.filename,
          created_by: user.id,
        };
      }) : [];

      // Calculate the total amount of the new sales_incentives
      const salesIncentiveTotalAmount = await this.dbService.sales_incentive.findMany({
        where: {
          id: {
            in: newSalesIncentiveIds
          }
        }
      }).then((data) => data.reduce((acc, curr) => acc + Number(curr?.nominal), 0));

      // Perform the update in a transaction
      const [comissionSalesIncentive, updateSalesIncentive] = await this.dbService.$transaction([
        this.dbService.comission_sales_incentive.update({
          where: { id },
          data: {
            total_amount: salesIncentiveTotalAmount,
            status: updateComissionSalesIncentiveDto.status,
            updated_by: user.id,
            comission_sales_incentive_evidence: {
              createMany: {
                data: evidences
              }
            }
          },
        }),

        this.dbService.sales_incentive.updateMany({
          where: {
            id: {
              in: salesIncentiveIdsToDisconnect
            }
          },
          data: {
            comission_sales_incentive_id: null
          }
        }),

        this.dbService.sales_incentive.updateMany({
          where: {
            id: {
              in: salesIncentiveIdsToConnect
            }
          },
          data: {
            comission_sales_incentive_id: id
          }
        })
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
    console.log(invoices);


    let nextCode: number;
    if (invoices[0]) {
      nextCode = invoices[0].id + 1;
    } else {
      nextCode = 0 + 1;
    }

    return {
      code: nextCode
    };
  }

  async comissionSalesIncentiveExportExcel(id: number, res: Response) {
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
              deleted_at: null
            },
            include: {
              sales: {
                include: {
                  bank: true,
                  store: true
                }
              },
              quotation: {
                include: {
                  order: {
                    include: {
                      members: true,
                      m_order_details: {
                        where: {
                          deleted_at: null
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
      });

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Comission Sales Incentive', {
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
      });


      worksheet.mergeCells('A2: N3');

      worksheet.getCell('A2').value = `DATA SALES INCENTIVE`;
      worksheet.getCell('A2').font = { size: 16, bold: true };
      worksheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };

      // Cek nilai setelah diatur
      console.log("Setelah pengaturan, nilai A1: ", worksheet.getCell('A2').value);

      // Definisikan kolom
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

      const headerRow = worksheet.addRow(worksheet.columns.map(col => col.header));
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

      let totals = {
        customer_transaction: 0,
        invoice_price: 0,
        instalation_price: 0,
        margin_ppn: 0,
        margin_non_ppn: 0,
        margin: 0,
        ppn: 0,
        price_difference: 0,
      };

      // Proses setiap order dalam data
      data.sales_incentive.forEach((item, index) => {
        const receipt_number = item.quotation.receipt_quotation ? item.quotation.receipt_quotation : item.quotation.order.receipt_number

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
          item_name: item.quotation?.order?.m_order_details?.map((x) => x?.item_name || '-'),
          instalation_fee: Number(item.quotation.quotation_grand_total),
          sales_incentive: Number(item.nominal),
        });

        row.eachCell((cell, colNumber) => {
          // Menambahkan border ke semua sel
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
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
        instalation_fee: data.sales_incentive.reduce((acc, curr) => acc + Number(curr?.quotation.quotation_grand_total), 0),
        sales_incentive: data.sales_incentive.reduce((acc, curr) => acc + Number(curr?.nominal), 0)
      });

      worksheet.mergeCells(`A${totalsRow.number}:E${totalsRow.number}`);
      totalsRow.getCell('A').alignment = { vertical: 'middle', horizontal: 'center' };

      totalsRow.eachCell((cell, colNumber) => {
        if (colNumber > 1) {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        }

        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });

      // Fungsi untuk mendapatkan tanggal format saat ini
      const getFormattedDate = () => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      };

      // Fungsi untuk membuat path file Excel
      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/comission-sales-incentive';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const excelFileName = `${baseName}-${Date.now()}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      // Fungsi untuk menulis workbook dan mengirimkan respons
      const writeWorkbookAndSendResponse = async (
        workbook: exceljs.Workbook,
        excelFilePath: string,
        res: Response,
      ) => {
        await workbook.xlsx.writeFile(excelFilePath);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${path.basename(excelFilePath)}`);
        const fileStream = fs.createReadStream(excelFilePath);
        fileStream.pipe(res);
      };

      // Generate file Excel
      const generateExcelFile = async (res) => {
        const formattedDate = getFormattedDate();
        const baseName = `DataComissionSalesIncentiveId${id}-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);
        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      // Jalankan pembuatan file Excel
      return generateExcelFile(res);
    } catch (error) {
      console.error(error);
      res.status(500).send("An error occurred while generating the invoice.");
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
            deleted_at: null
          },
          include: {
            sales: {
              include: {
                bank: true,
                store: true
              }
            },
            quotation: {
              include: {
                order: {
                  include: {
                    members: true,
                    m_order_details: {
                      where: {
                        deleted_at: null
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
    });


    if (!data) {
      console.error('Comission Sales Incentive not found!');
      throw new NotFoundException('Comission Sales Incentive not found!');
    }

    console.log(data.sales_incentive[0].sales.bank.bank_name)

    const buffer = await this.pdfService.generateLandscape('comission-sales-incentive-pdf', data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=comission-sales-incentive.pdf');
    res.send(buffer);
  }
}
