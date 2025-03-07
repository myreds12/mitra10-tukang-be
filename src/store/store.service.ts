/* eslint-disable prettier/prettier */
import {
  Injectable,
  HttpStatus,
  BadGatewayException,
} from '@nestjs/common';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { hash } from 'bcrypt';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StoreService {
  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
  ) { }
  async create(dto: CreateStoreDto, user_id: number) {
    try {
      const role = await this.dbService.roles.findFirst({
        where: {
          name: {
            equals: 'Store CS',
          },
        },
      });
      const username = dto.default_username
        ? dto.default_username
        : `${dto.store_name.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '_')}`;
      const user = await this.dbService.users.create({
        data: {
          username,
          password: await hash(dto?.default_password ?? 'password', 10),
          role_id: role.id,
        },
      });
      const store = await this.dbService.store.create({
        data: {
          user_id: user.id,
          store_name: dto.store_name,
          store_group_id: dto.store_group_id,
          bank_name: dto.bank_name,
          bank_account: dto.bank_account,
          bank_number: dto.bank_number,
          email: dto.email,
          phone_number_1: dto.phone_number_1,
          phone_number_2: dto.phone_number_2,
          address: dto.address,
          additional_address: dto.additional_address,
          area_id: dto.area_id,
          zip_code: dto.zip_code,
          created_by: user_id,
        },
      });

      await this.emailQueue.add(
        'send-credential-mail',
        {
          username: username,
          password: dto.default_password,
        },
        {
          attempts: 3,
        },
      );

      return { data: store, meta: { user } };
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to create',
      };
    }
  }

  async findAll(query: QueryParamsDto) {
    const {
      take,
      page,
      search,
      date_from,
      date_to,
      area_id,
      store_group_id,
      vendor_id,
      top_best,
      order_date_from,
      order_date_to,
      is_promotion
    } = query;

    const where: Prisma.storeWhereInput = {
      AND: [
        ...(area_id ? [{ area_id: { in: area_id } }] : []),
        ...(search ? [{ store_name: { contains: search } }] : []),
        ...(store_group_id ? [{ store_group_id: { equals: store_group_id } }] : []),
        ...(date_from && date_to ? [{
          created_at: { gte: new Date(date_from), lte: new Date(`${date_to}T23:59:59.000Z`) }
        }] : []),
        ...(vendor_id ? [{ vendor_store: { some: { vendor_id: { equals: vendor_id } } } }] : []),
        { deleted_at: null }
      ]
    };

    const skip = take > 0 ? page * take - take : 0;

    // 1. Ambil data store dengan hanya 10 order terbaru
    const stores = await this.dbService.store.findMany({
      where,
      skip,
      take: take > 0 ? take : undefined,
      include: {
        area: true,
        users: true,
        vendor_store: true,
        orders: {
          where: {
            deleted_at: null,
            ...(order_date_from && order_date_to ? {
              created_at: { gte: new Date(order_date_from), lte: new Date(`${order_date_to}T23:59:59.000Z`) }
            } : {}),
            ...(is_promotion === 1 ? { payment_type: { not: "survey" } } : is_promotion === 0 ? { payment_type: "survey" } : {})
          },
          orderBy: { created_at: "desc" },
          take: 10,
          include: {
            status: true,
            quotation: {
              where: { deleted_at: null },
              include: {
                quotation_receipt: { where: { deleted_at: null } }
              }
            }
          }
        }
      }
    });

    const storeIds = stores.map(s => s.id);

    // 2. Query aggregate untuk menghitung total order, unpaid, dan paid
    const [orderAggregates, unpaidAggregates, paidAggregates] = await Promise.all([
      this.dbService.orders.groupBy({
        by: ["store_id"],
        where: {
          store_id: { in: storeIds },
          deleted_at: null,
          ...(order_date_from && order_date_to ? {
            created_at: { gte: new Date(order_date_from), lte: new Date(`${order_date_to}T23:59:59.000Z`) }
          } : {}),
          ...(is_promotion === 1 ? { payment_type: { not: "survey" } } : is_promotion === 0 ? { payment_type: "survey" } : {})
        },
        _count: { id: true },
        _sum: { grand_total: true }
      }),
      this.dbService.orders.groupBy({
        by: ["store_id"],
        where: {
          store_id: { in: storeIds },
          deleted_at: null,
          quotation: { some: { quotation_receipt: { none: {} } } } // Tidak ada receipt = unpaid
        },
        _count: { id: true },
        _sum: { grand_total: true }
      }),
      this.dbService.orders.groupBy({
        by: ["store_id"],
        where: {
          store_id: { in: storeIds },
          deleted_at: null,
          quotation: { some: { quotation_receipt: { some: {} } } } // Ada receipt = paid
        },
        _count: { id: true },
        _sum: { grand_total: true }
      })
    ]);

    // 3. Konversi hasil aggregate ke map untuk akses cepat
    const orderMap = Object.fromEntries(orderAggregates.map(o => [o.store_id, o]));
    const unpaidMap = Object.fromEntries(unpaidAggregates.map(o => [o.store_id, o]));
    const paidMap = Object.fromEntries(paidAggregates.map(o => [o.store_id, o]));

    // 4. Gabungkan hasil aggregate ke dalam store
    const dataStore = stores.map(store => {
      const totalOrder = orderMap[store.id]?._count.id || 0;
      const totalUnpaidOrder = unpaidMap[store.id]?._count.id || 0;
      const totalPaidOrder = paidMap[store.id]?._count.id || 0;
      const totalUnpaidValue = unpaidMap[store.id]?._sum.grand_total || 0;
      const totalPaidValue = paidMap[store.id]?._sum.grand_total || 0;

      return {
        ...store,
        total_order: totalOrder,
        total_unpaid_order: totalUnpaidOrder,
        total_unpaid_value: totalUnpaidValue,
        total_paid_order: totalPaidOrder,
        total_paid_value: totalPaidValue
      };
    });

    // Jika `top_best` diaktifkan, urutkan berdasarkan jumlah order terbanyak
    if (Boolean(top_best)) {
      dataStore.sort((a, b) => b.total_order - a.total_order);
    }

    const total = await this.dbService.store.count({ where });

    return {
      data: dataStore,
      meta: {
        total,
        skip,
        page,
        take
      }
    };
  }


  async findOne(id: number) {
    try {
      const store = await this.dbService.store.findFirst({
        where: {
          id,
        },
        include: {
          area: true,
          users: true,
        },
      });

      return store;
    } catch (error) {
      console.log(error);
    }
  }

  async update(id: number, dto: UpdateStoreDto, user_id: number) {
    try {
      const store = await this.dbService.store.findFirst({
        where: {
          id,
        },
        include: {
          area: true,
          users: true,
        },
      });
      const username = dto.default_username
        ? dto.default_username
        : `${dto.store_name.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '_')}`;
      const user = store.user_id
        ? await this.dbService.users.update({
          where: {
            id: store.user_id,
          },
          data: {
            username,
            password: dto?.default_password
              ? await hash(dto?.default_password ?? 'password', 10)
              : store.users.password,
          },
        })
        : undefined;
      const storeUpdate = await this.dbService.store.update({
        where: {
          id,
        },
        data: {
          store_name: dto.store_name,
          store_group_id: dto.store_group_id,
          bank_name: dto.bank_name,
          bank_account: dto.bank_account,
          bank_number: dto.bank_number,
          email: dto.email,
          phone_number_1: dto.phone_number_1,
          phone_number_2: dto.phone_number_2,
          address: dto.address,
          additional_address: dto.additional_address,
          area_id: dto.area_id,
          zip_code: dto.zip_code,
          updated_by: user_id,
          updated_at: new Date(),
        },
      });

      await this.emailQueue.add(
        'send-credential-mail',
        {
          username: username,
          password: dto.default_password,
        },
        {
          attempts: 3,
        },
      );

      return {
        data: storeUpdate,
        meta: { user },
      };
    } catch (error) {
      console.log(error);

      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    try {
      await this.dbService.store.update({
        where: {
          id,
        },
        data: {
          deleted_by: user_id,
          deleted_at: new Date(),
        },
      });

      return;
    } catch (error) {
      console.log(error);
      throw new BadGatewayException('Failed to delete store');
    }
  }

  async getCode() {
    const stores = await this.dbService.store.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return stores[0] || null;
  }

  async storeExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {

      const {
        take,
        search,
        date_from,
        date_to,
        area_id,
        store_group_id,
        vendor_id,
        order_date_from,
        order_date_to,
        is_promotion
      } = queryParams;

      const where: Prisma.storeWhereInput = {
        AND: [
          ...(area_id
            ? [
              {
                OR: [
                  {
                    area_id: {
                      in: area_id,
                    },
                  },
                ],
              },
            ]
            : []),
          ...(search
            ? [
              {
                OR: [
                  {
                    store_name: {
                      contains: search,
                    },
                  },
                ],
              },
            ]
            : []),
          ...(store_group_id
            ? [
              {
                OR: [{ store_group_id: { equals: store_group_id } }],
              },
            ]
            : []),
          ...(date_from && date_to
            ? [
              {
                created_at: {
                  gte: new Date(date_from),
                  lte: new Date(`${date_to}T23:59:59.000Z`),
                },
              },
            ]
            : []),
          ...(vendor_id
            ? [
              {
                vendor_store: { some: { vendor_id: { equals: vendor_id } } },
              },
            ]
            : []),
          ...(order_date_from && order_date_to
            ? [
              {
                orders: {
                  some: {
                    created_at: {
                      gte: new Date(order_date_from),
                      lte: new Date(`${order_date_to}T23:59:59.000Z`),
                    },
                  }
                },
              },
            ]
            : []),
        ],


        deleted_at: null,
      };

      const data = await this.dbService.store.findMany({
        where,
        take: take > 0 ? take : undefined,
        include: {
          area: true,
          users: true,
          vendor_store: true,
          orders: {
            where: {
              deleted_at: null,
              ...(order_date_from && order_date_to ? {
                created_at: {
                  gte: new Date(order_date_from),
                  lte: new Date(`${order_date_to}T23:59:59.000Z`),
                }
              } : {}),
              ...(is_promotion === 1 ? {
                payment_type: {
                  not: 'survey'
                }
              } : is_promotion === 0 ? {
                payment_type: 'survey'
              } : {}),
            },
            orderBy: {
              created_at: 'desc',
            },
            include: {
              status: true,
              quotation: {
                where: {
                  deleted_at: null
                },
                include: {
                  quotation_receipt: {
                    where: {
                      deleted_at: null
                    }
                  }
                }
              },
            },
          },
        },
      });

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Store ', {
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
        { header: 'Toko Id', key: 'id', width: 20 },
        { header: 'Nama Toko', key: 'store_name', width: 35 },
        { header: 'Email', key: 'email', width: 35 },
        { header: 'Alamat', key: 'address', width: 35 },
        { header: 'Phone Number', key: 'phone_number', width: 35 },
        { header: 'Nama Bank', key: 'bank_name', width: 35 },
        { header: 'Nomor Akun', key: 'bank_number', width: 35 },
        { header: 'Nama Akun', key: 'bank_account', width: 35 },
        { header: 'Username', key: 'username', width: 35 },
        { header: 'Tanggal Terakhir Order', key: 'username', width: 55 },
        { header: 'Selisih', key: 'date_diff', width: 35 },
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

      data.forEach((store) => {
        const formattedDateTime = (dateTime) =>
          `${dateTime.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${dateTime.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        const currentMonth = new Date();
        const orderDate = store.orders[0]?.created_at
          ? new Date(store?.orders[0]?.created_at)
          : store.created_at;

        const monthDifference =
          (currentMonth.getFullYear() - orderDate.getFullYear()) * 12 +
          currentMonth.getMonth() -
          orderDate.getMonth();
        console.log("MONTH DIFFERENCE", monthDifference);
        const row = worksheet.addRow({
          id: store.id,
          store_name: store.store_name ? store.store_name : '',
          email: store.email ? store.email : '',
          address: store.address ? store.address : '',
          phone_number: store.phone_number_1
            ? store.phone_number_1
            : store.phone_number_2,
          bank_name: store.bank_name ? store.bank_name : '',
          bank_number: store.bank_number ? store.bank_number : '',
          bank_account: store.bank_account ? store.bank_account : '',
          username: store.users ? store.users.username : '',
          order_date: store.orders[0]?.created_at
            ? formattedDateTime(store.orders[0].created_at)
            : '',
          date_diff: monthDifference,
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
        const folderPath = './uploads/excel/store';
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
        const baseName = `DataStore-${getFormattedDate()}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(data, res);
    } catch (error) {
      throw error;
    }
  }
}
