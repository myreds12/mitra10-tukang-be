import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { CreateTukangDto } from './dto/create-tukang.dto';
import { UpdateTukangDto } from './dto/update-tukang.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash, hashSync } from 'bcrypt';
import { Prisma, users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { PdfService } from 'src/common/service/pdf.service';

@Injectable()
export class TukangService {
  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
    private pdfService: PdfService,
  ) {}
  async create(
    createTukangDto: CreateTukangDto,
    user: users,
    files: TukangFiles,
  ) {
    try {
      const { id: user_id } = user;
      const tukangFiles: Array<Prisma.tukang_documentCreateManyInput> = files
        ? Object.entries(files).map((file) => {
            if (file[0].length) {
              const newFile = file[1].map((item) => ({
                document_name: file[0],
                path: item.filename,
                created_by: user_id,
              }));

              return newFile;
            }
          })
        : undefined;

      const roles = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'tukang',
          },
        },
      });

      const tukangServiceTypes: Prisma.tukang_serviceCreateManyTukangInput[] =
        createTukangDto.service_types
          ? createTukangDto.service_types.map((item) => {
              return {
                service_type_id: item.service_type_id,
                created_by: user_id,
              };
            })
          : undefined;

      const tukangArea: Prisma.tukang_areaCreateManyTukangInput[] =
        createTukangDto.tukang_area
          ? createTukangDto.tukang_area.map((item) => {
              return {
                area_id: item.area_id,
                created_by: user_id,
              };
            })
          : undefined;

      const saltedPassword = hashSync(
        createTukangDto?.password ?? 'password',
        12,
      );

      const formattedUsername =  createTukangDto?.username.replace(/ /g, '_') ?? undefined;

      

      const userData = await this.dbService.users.create({
        data: {
          username:
          formattedUsername ??
            `${createTukangDto.full_name.toLowerCase().replace(/ /g, '_')}`,
          password: saltedPassword,
          role_id: roles.id,
        },
      });

      const tukangData: Prisma.tukangCreateInput = {
        users: {
          connect: {
            id: userData.id,
          },
        },
        vendor: {
          connect: {
            id: createTukangDto.vendor_id,
          },
        },
        email: createTukangDto.email,
        full_name: createTukangDto.full_name,
        ktp_number: createTukangDto.ktp_number,
        join_date: createTukangDto.join_date
          ? new Date(createTukangDto.join_date)
          : undefined,
        address: createTukangDto.address,
        phone_number: createTukangDto.phone_number,
        bod: new Date(createTukangDto.bod),
        ...(tukangFiles
          ? {
              tukang_document: {
                createMany: {
                  data: tukangFiles.flat(),
                },
              },
            }
          : undefined),
        ...(tukangArea
          ? {
              tukang_area: {
                createMany: {
                  data: tukangArea,
                },
              },
            }
          : undefined),
        ...(tukangServiceTypes
          ? {
              tukang_service: {
                createMany: {
                  data: tukangServiceTypes,
                },
              },
            }
          : undefined),
      };

      const [tukang] = await this.dbService.$transaction([
        this.dbService.tukang.create({
          data: tukangData,
          include: {
            users: true,
          },
        }),
      ]);
      this.emailQueue.add(
        'send-credential-mail',
        {
          username: tukang?.users.username,
          password: createTukangDto?.password ?? 'password',
        },
        {
          attempts: 3,
        },
      );

      // await this.sendEmailService.sendCredentialMail(createTukangDto.username,  createTukangDto.password);
      return { data: tukang, meta: { user: userData } };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const {
        date_from,
        vendor_id,
        date_to,
        page,
        search,
        take,
        search_date_from,
        search_date_to,
        service_types,
        area_id,
      } = query;
      const skip = page * take - take;

      const where: Prisma.tukangWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    {
                      id: !isNaN(+search) ? +search : undefined,
                    },
                    {
                      tukang_area: {
                        some: {
                          area: {
                            area: {
                              contains: search,
                            }
                          }
                        }
                      }
                    },
                    { address: { contains: search } },
                    { email: { contains: search } },
                    { phone_number: { contains: search } },
                    { full_name: { contains: search } },
                    { ktp_number: { contains: search } },
                    {
                      full_name: {
                        contains: search,
                      },
                    },
                    { vendor: { company_name: { contains: search } } },
                    {
                      tukang_service: {
                        some: {
                          service_type: { service_type: { contains: search } },
                        },
                      },
                    },
                  ],
                },
              ]
            : []),
          service_types
            ? {
                tukang_service: {
                  some: {
                    service_type_id: {
                      in: service_types,
                    },
                  },
                },
              }
            : undefined,
          area_id
            ? {
                tukang_area: {
                  some: {
                    area_id: {
                      in: area_id
                    }
                  },
                },
              }
            : undefined,
          vendor_id
            ? {
                vendor_id: vendor_id,
              }
            : undefined,
          search_date_from && search_date_to
            ? {
                join_date: {
                  gte: new Date(`${search_date_from}T00:00:00.000Z`),
                  lte: new Date(`${search_date_to}T23:59:59.000Z`),
                },
              }
            : undefined,
          date_from && date_to
            ? {
                created_at: {
                  gte: new Date(`${date_from}T00:00:00.000Z`),
                  lte: new Date(`${date_to}T23:59:59.000Z`),
                },
              }
            : undefined,
        ],
        deleted_at: null,
      };

      const tukang = await this.dbService.tukang.findMany({
        where,
        skip,
        take: take <= 0 ? undefined : take,
        include: {
          users: true,
          vendor: true,
          work_order_tukang: {
            where: {
              deleted_at: null
            },
            orderBy: {
              created_at: 'desc'
            },
            include: {
              work_orders: {
                include: {
                  status: true,
                  work_order_status: {
                    include: {
                      status: true
                    },
                    orderBy: {
                      created_at: 'desc'
                    }
                  },
                  order: true
                }
              }
            }
          },
          tukang_area: {
            include: {
              area: true,
              tukang: true
            },
          },
          tukang_service: {
            include: {
              service_type: true,
            },
          },
          tukang_document: true,
        },
      });

      const tukangWithSlotOrder = tukang.map((tukangItem) => {
        const dailySlots = tukangItem.work_order_tukang.filter((item) => {
          const orderDate = new Date(item.work_orders.work_order_status[0].created_at).toISOString().split('T')[0];
          const currentDate = new Date().toISOString().split('T')[0];
          // console.log("ORDER DATE:" ,orderDate, "CURRENT DATE: ",currentDate);
          
      
          return (
            item.work_orders.status.category !== 'SURVEYDONE' &&
            item.work_orders.status.category !== 'WORKEND' &&
            orderDate === currentDate
          );
        });
      
        return {
          ...tukangItem,
          slot_order: dailySlots.length,
        };
      });

      const countTotal = await this.dbService.tukang.count({
        where,
      });

      return {
        data: tukangWithSlotOrder,
        meta: { skip, take, page, countTotal: countTotal },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const tukang = await this.dbService.tukang.findFirst({
        where: {
          id,
        },
        include: {
          users: true,
          vendor: true,
          work_order_tukang: {
            where: {
              deleted_at: null
            },
            orderBy: {
              created_at: 'desc'
            },
            include: {
              work_orders: {
                include: {
                  work_order_status: {
                    include: {
                      status: true
                    },
                    orderBy: {
                      created_at: 'desc'
                    }
                  },
                  order: true
                }
              }
            }
          },
          tukang_area: {
            include: {
              area: true,
              tukang: true
            },
          },
          tukang_service: {
            include: {
              service_type: true,
            },
          },
          tukang_document: true,
        },
      });

      return tukang;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async update(
    id: number,
    updateTukangDto: UpdateTukangDto,
    user: users,
    files?: TukangFiles,
  ) {
    try {
      console.log(updateTukangDto);
      const { id: user_id } = user;
      const tukang = await this.dbService.tukang.findFirst({
        where: {
          id,
        },
        include: {
          users: true
        }
      });


      const tukangFiles: Array<Prisma.tukang_documentCreateManyInput> = files
        ? Object.entries(files).map((file) => {
            if (file[0].length) {
              const newFile = file[1].map((item) => ({
                document_name: file[0],
                path: item.filename,
                created_by: user_id,
              }));

              return newFile;
            }
          })
        : undefined;
      console.log(updateTukangDto.service_types);

      const tukangServiceTypesUpsert: Prisma.tukang_serviceUpsertWithWhereUniqueWithoutTukangInput[] =
        updateTukangDto.service_types
          ? updateTukangDto.service_types.map((item) => ({
              where: {
                id: item.id ?? 0,
                tukang_id: id,
              },
              create: {
                service_type_id: item.service_type_id,
                created_by: user_id,
              },
              update: {
                service_type_id: item.service_type_id,
                updated_by: user_id,
                updated_at: new Date(),
              },
            }))
          : undefined;

      const tukangAreaUpsert: Prisma.tukang_areaUpsertWithWhereUniqueWithoutTukangInput[] =
        updateTukangDto.tukang_area
          ? updateTukangDto.tukang_area.map((item) => ({
              where: {
                id: item.id ?? 0,
                tukang_id: id,
              },
              create: {
                area_id: item.area_id,
                created_by: user_id,
              },
              update: {
                area_id: item.area_id,
                updated_by: user_id,
                updated_at: new Date(),
              },
            }))
          : undefined;

      const tukangUpdate: Prisma.tukangUpdateInput = {
        ...(updateTukangDto?.vendor_id
          ? {
              vendor: {
                connect: {
                  id: updateTukangDto.vendor_id,
                },
              },
            }
          : undefined),
        email: updateTukangDto?.email,
        full_name: updateTukangDto?.full_name,
        ktp_number: updateTukangDto?.ktp_number,
        join_date: updateTukangDto?.join_date
          ? new Date(updateTukangDto.join_date)
          : undefined,
        address: updateTukangDto?.address,
        phone_number: updateTukangDto?.phone_number,
        bod: updateTukangDto?.bod ? new Date(updateTukangDto.bod) : undefined,
        is_active: Boolean(updateTukangDto.is_active),
        ...(updateTukangDto.is_delete === 1 ? {
          deleted_at: new Date(),
          users: {
            update: {
              deleted_at: new Date()
            }
          }
        } : {
          deleted_at: null,
          users: {
            update: {
              deleted_at: null
            }
          }
        }),
        ...(tukangServiceTypesUpsert
          ? {
              tukang_service: {
                upsert: tukangServiceTypesUpsert,
              },
            }
          : undefined),
        ...(tukangAreaUpsert
          ? {
              tukang_area: {
                upsert: tukangAreaUpsert,
              },
            }
          : undefined),
        ...(tukangFiles
          ? {
              tukang_document: {
                createMany: {
                  data: tukangFiles.flat(),
                },
              },
            }
          : undefined),
      };

      const data = await this.dbService.$transaction([
        this.dbService.tukang.update({
          where: {
            id,
          },
          data: tukangUpdate,
        }),
        ...(updateTukangDto.is_active != null
          ? [
              this.dbService.tukang_document.updateMany({
                where: {
                  tukang_id: id,
                },
                data: {
                  deleted_at: new Date(),
                  deleted_by: user_id,
                },
              }),
            ]
          : []),
        ...(updateTukangDto.service_types
          ? [
              this.dbService.tukang_service.updateMany({
                ...(updateTukangDto.service_types
                  ? {
                      where: {
                        tukang_id: id,
                        NOT: updateTukangDto.service_types.map((item) => {
                          return {
                            service_type_id: item.service_type_id,
                            id: item?.id,
                          };
                        }),
                      },
                    }
                  : undefined),
                data: {
                  deleted_at: new Date(),
                  deleted_by: user_id,
                },
              }),
            ]
          : []),
      ]);
      const formattedUsername =  updateTukangDto?.username ? updateTukangDto?.username.replace(/ /g, '_') : tukang.users.username;
      const saltedPassword = updateTukangDto.password ? hashSync(
        updateTukangDto?.password,
        12,
      ) : tukang.users.password;
      

      const userData = await this.dbService.users.update({
        where: {
          id: tukang.user_id
        },
        data: {
          username:
          formattedUsername ??
            `${updateTukangDto?.full_name?.toLowerCase().replace(/ /g, '_')}`,
          password: saltedPassword,
        },
      });

      return data[0];
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    try {
      await this.dbService.tukang.update({
        where: {
          id,
        },
        data: {
          is_active: false,
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async getCode() {
    try {
      const complaints = await this.dbService.tukang.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return complaints[0] || null;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async tukangExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const { data } = await this.findAll(queryParams);

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Profile Sales ', {
        properties: {
          tabColor: {
            argb: 'FF4CAF50',
          },
          outlineLevelCol: 6,
          outlineLevelRow: 40,
        },
        pageSetup: {
          margins: {
            left: 90.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3,
          },
        },
      });

      worksheet.columns = [
        { header: 'Tukang Id', key: 'id', width: 20 },
        { header: 'Nama Vendor', key: 'company_name', width: 35 },
        { header: 'Nama Tukang', key: 'full_name', width: 35 },
        { header: 'Alamat', key: 'address', width: 35 },
        { header: 'Email', key: 'email', width: 35 },
        { header: 'Phone Number', key: 'phone_number', width: 35 },
        { header: 'Tanggal Lahir', key: 'bod', width: 35 },
        { header: 'Nomor KTP', key: 'ktp_number', width: 35 },
        { header: 'Username', key: 'username', width: 35 },
        { header: 'Tanggal Bergabung', key: 'join_date', width: 50 },
        { header: 'Service Type', key: 'tukang_service', width: 50 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '0000FF' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      data.forEach((tukang) => {
        const formattedDateTime = (date) =>
          `${date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${date.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        const tukangService = tukang.tukang_service
          ? tukang.tukang_service
              .map((service) => service.service_type.service_type)
              .join(',')
          : '';
        const row = worksheet.addRow({
          id: tukang.id,
          company_name: tukang.vendor ? tukang.vendor.company_name : '',
          full_name: tukang.full_name ? tukang.full_name : '',
          address: tukang.address ? tukang.address : '',
          email: tukang.email ? tukang.email : '',
          phone_number: tukang.phone_number ? tukang.phone_number : '',
          bod: tukang.bod ? formattedDateTime(new Date(tukang.bod)) : '',
          ktp_number: tukang.ktp_number ? tukang.ktp_number : '',
          username: tukang.users ? tukang.users.username : '',
          join_date: tukang.join_date
            ? formattedDateTime(new Date(tukang.join_date))
            : formattedDateTime(new Date(tukang.created_at)),
          tukang_service: tukangService,
        });

        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      });

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName) => {
        const folderPath = './uploads/excel/tukang';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }

        const excelFileName = `${baseName}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      const writeWorkbookAndSendResponse = async (
        workbook,
        excelFilePath,
        res,
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

      const generateExcelFile = async (data, res) => {
        const baseName = `DataTukang-${getFormattedDate()}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(data, res);
    } catch (error) {
      throw error;
    }
  }

  async tukangOrderPdf(res: Response, queryParams: QueryParamsDto) {
    const { tukang_id, vendor_id, date_from, date_to, order_by } = queryParams;
      const where: Prisma.work_order_tukangWhereInput = {
        AND: [
          vendor_id
            ? {
              work_orders: {
                vendor_id: vendor_id,
              }
            }
            : undefined,
          tukang_id
            ? {
              tukang_id: tukang_id
            }
            : undefined,
          date_from && date_to
            ? {
              work_orders: {
                order: {
                  created_at: {
                    gte: new Date(`${date_from}T00:00:00.000Z`),
                      lte: new Date(`${date_to}T23:59:59.000Z`),
                  }
                }
              }
            } 
            : undefined,
        ].filter(Boolean),
        deleted_at: null,
      };
      const tukang = await this.dbService.work_order_tukang.findMany({
        where,
        orderBy: {
          created_at: order_by
        },
        include: {
          tukang: true,
          work_orders: {
            include: {
              order: {
                include: {
                  status: true,
                  store: true,
                  members: true,
                  m_order_details: true
                }
              }
            }
          }
        }
      });

    const data = {
      tukang
    };

    console.log(data.tukang);
    
    const buffer = await this.pdfService.generate('tukang-pdf', data);
    // Set headers to download the PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=quotation.pdf');
    res.send(buffer);
  }

  async tukangExportOrderExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const { tukang_id, vendor_id, date_from, date_to } = queryParams;
      const where: Prisma.work_order_tukangWhereInput = {
        AND: [
          vendor_id
            ? {
              work_orders: {
                vendor_id: vendor_id,
              }
            }
            : undefined,
          tukang_id
            ? {
              tukang_id: tukang_id
            }
            : undefined,
          date_from && date_to
            ? {
              work_orders: {
                order: {
                  created_at: {
                    gte: new Date(`${date_from}T00:00:00.000Z`),
                      lte: new Date(`${date_to}T23:59:59.000Z`),
                  }
                }
              }
            } 
            : undefined,
        ].filter(Boolean),
        deleted_at: null,
      };
      const data = await this.dbService.work_order_tukang.findMany({
        where,
        include: {
          tukang: true,
          work_orders: {
            include: {
              order: {
                include: {
                  status: true,
                  store: true,
                  members: true,
                  m_order_details: true
                }
              }
            }
          }
        }
      });

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Order Tukang ', {
        properties: {
          tabColor: {
            argb: 'FF4CAF50',
          },
          outlineLevelCol: 6,
          outlineLevelRow: 40,
        },
        pageSetup: {
          margins: {
            left: 90.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3,
          },
        },
      });

      worksheet.columns = [
        { header: 'Order Id', key: 'id', width: 20 },
        { header: 'Tanggal Order', key: 'order_created', width: 35 },
        { header: 'Nama Customer', key: 'member_name', width: 35 },
        { header: 'Jenis Pemasangan', key: 'item_name', width: 35 },
        { header: 'Status Order', key: 'order_status', width: 35 },
        { header: 'Notes', key: 'notes', width: 35 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '0000FF' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      data.forEach((tukang) => {
        const formattedDateTime = (date) =>
          `${date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${date.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        const row = worksheet.addRow({
          id: tukang.work_orders.order_id,
          order_created: tukang.work_orders.order.created_at ? formattedDateTime(tukang.work_orders.order.created_at) : '',
          member_name: tukang.work_orders.order.members.full_name ? tukang.work_orders.order.members.full_name : '',
          item_name: tukang.work_orders.order.m_order_details ? tukang.work_orders.order.m_order_details
          .map((item) => item?.item_name || '-')
          .join(', ') : 'Jenis Jasa Pemasangan Belum Ditentukan',
          order_status: tukang.work_orders.order.status.description ? tukang.work_orders.order.status.description : '',
          notes: tukang.notes ? tukang.notes : 'Notes Belum Ditentukan',
        });

        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      });

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName) => {
        const folderPath = './uploads/excel/tukang-order';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }

        const excelFileName = `${baseName}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      const writeWorkbookAndSendResponse = async (
        workbook,
        excelFilePath,
        res,
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

      const generateExcelFile = async (data, res) => {
        const baseName = `DataTukang-${getFormattedDate()}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(data, res);
    } catch (error) {
      throw error;
    }
  }
}
