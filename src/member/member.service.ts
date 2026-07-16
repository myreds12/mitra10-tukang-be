/* eslint-disable prettier/prettier */
import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MemberService {
  constructor(private readonly dbService: PrismaService) { }

  async create(createMemberDto: CreateMemberDto, user_id) {
    try {
      const store = await this.dbService.store.findFirst({
        where: {
          id: createMemberDto.join_location,
          deleted_at: null,
        },
      });
      if (!store) {
        throw new BadRequestException('Toko tidak ditemukan!');
      }

      if (!createMemberDto.email) {
        throw new BadRequestException('Email wajib diisi!');
      }

      //buat kan agar phone number dan whatsapp number menggunakan format 08 di awal dengan mengubah nya dan bukan sebuah validasi, dengan contoh input +628 dan diubah menjadi 08 
      const formatPhoneNumber = (number: string) => {
        if (number.startsWith('+62')) {
          return '0' + number.slice(3);
        } else if (number.startsWith('62')) {
          return '0' + number.slice(2);
        } else {
          return number;
        }
      };

      const formattedPhoneNumber = createMemberDto.phone_number
        ? formatPhoneNumber(createMemberDto.phone_number)
        : null;
      const formattedWhatsappNumber = createMemberDto.whatsapp_number
        ? formatPhoneNumber(createMemberDto.whatsapp_number)
        : null;
      createMemberDto.phone_number = formattedPhoneNumber;
      createMemberDto.whatsapp_number = formattedWhatsappNumber;
      const existingMember = await this.dbService.members.findFirst({
        where: {
          join_location: createMemberDto.join_location,
          deleted_at: null,
          OR: [
            { email: createMemberDto.email },
            ...(createMemberDto.phone_number
              ? [{ phone_number: createMemberDto.phone_number }]
              : []),
            ...(createMemberDto.whatsapp_number
              ? [{ whatsapp_number: createMemberDto.whatsapp_number }]
              : []),
          ],
        },
      });
      if (existingMember) {
        if (existingMember.email === createMemberDto.email) {
          throw new BadRequestException('Email sudah terdaftar di toko ini!');
        }
        if (
          createMemberDto.phone_number &&
          existingMember.phone_number === createMemberDto.phone_number
        ) {
          throw new BadRequestException('Nomor telepon sudah terdaftar di toko ini!');
        }
        if (
          createMemberDto.whatsapp_number &&
          existingMember.whatsapp_number === createMemberDto.whatsapp_number
        ) {
          throw new BadRequestException('Nomor WhatsApp sudah terdaftar di toko ini!');
        }
      }

      const numberMember =
        createMemberDto.phone_number ?? createMemberDto.whatsapp_number;

      const member = await this.dbService.members.create({
        data: {
          full_name: createMemberDto.full_name,
          email: createMemberDto.email,
          member_number: numberMember,
          address_1: createMemberDto.address_1,
          address_2: createMemberDto.address_2,
          join_date: createMemberDto.join_date
            ? new Date(createMemberDto.join_date)
            : undefined,
          phone_number: createMemberDto.phone_number,
          whatsapp_number: createMemberDto.whatsapp_number,
          zip_code: createMemberDto.zip_code,
          //join location diisi dengan store id
          join_location: createMemberDto.join_location
            ? createMemberDto.join_location
            : undefined,
          area_id: createMemberDto.area_id,
          rating: createMemberDto.rating,

          created_by: user_id,
        },
      });

      return member;
    } catch (error) {
      console.log(error);

      throw error;
    }
  }


  normalizePhone(value?: string | null): string | null {
    if (!value) return null;

    let v = value.trim();
    if (v === '') return null;

    v = v.replace(/[^0-9]/g, '');

    while (v.startsWith('62')) {
      v = v.slice(2);
    }

    if (v.startsWith('8')) {
      return '0' + v;
    }

    if (v.startsWith('08')) {
      return v;
    }

    return v;
  }

  async normalizePhoneNumbers(batchSize = 100) {
    let lastId = 0;
    let success = 0;
    let failed = 0;
    let skipped = 0;

    while (true) {
      const members = await this.dbService.members.findMany({
        where: { id: { gt: lastId } },
        orderBy: { id: 'asc' },
        take: batchSize,
      });

      if (members.length === 0) break;

      for (const m of members) {
        lastId = m.id;

        try {
          const memberNumber = this.normalizePhone(m.member_number);
          const whatsapp = this.normalizePhone(m.whatsapp_number);
          const phone = this.normalizePhone(m.phone_number);

          if (
            memberNumber === m.member_number &&
            whatsapp === m.whatsapp_number &&
            phone === m.phone_number
          ) {
            skipped++;
            continue;
          }

          await this.dbService.members.update({
            where: { id: m.id },
            data: {
              member_number: memberNumber,
              whatsapp_number: whatsapp,
              phone_number: phone,
            },
          });

          success++;
        } catch (err) {
          failed++;
          console.log('Gagal update id', m.id, err?.message);
        }
      }
    }

    return {
      success,
      failed,
      skipped,
    };
  }


  async findAll(query: QueryParamsDto) {
    try {
      const {
        search,
        date_from,
        date_to,
        store_id,
        page,
        take,
        top_best,
        order_date_from,
        order_date_to,
      } = query;

      const where: Prisma.membersWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  {
                    id: !isNaN(+search) ? +search : undefined,
                  },
                  { whatsapp_number: { contains: search } },
                  { phone_number: { contains: search } },
                  { member_number: { contains: search } },
                  {
                    full_name: {
                      contains: search,
                    }
                  },
                  {
                    join_location_store: {
                      store_name: {
                        contains: search
                      }
                    }
                  },
                  {
                    email: {
                      contains: search
                    }
                  }
                ],
              },
            ]
            : []),
          ...(store_id
            ? [
              {
                join_location_store: {
                  id: {
                    in: store_id,
                  },
                },
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
        ].filter(Boolean),
        deleted_at: null,
      };

      const skip = page * take - take;
      let members = await this.dbService.members.findMany({
        where,
        skip,
        take: take > 0 ? take : undefined,
        include: {
          join_location_store: true,
          area: true,
          order: {
            where: {
              AND: [
                {
                  deleted_at: null,
                },
                ...(order_date_from && order_date_to
                  ? [
                    {
                      created_at: {
                        gte: new Date(order_date_from),
                        lte: new Date(`${order_date_to}T23:59:59.000Z`),
                      },
                    },
                  ]
                  : []),
              ],
            },
            include: {
              complaints: true,
              status: true,
              quotation: {
                select: {
                  id: true,
                  receipt_quotation: true
                }
              },
              store: true,
              sales: true,
              m_order_details: true,
            },
            orderBy: {
              created_at: 'desc',
            },
          },
        },
      });

      if (Boolean(top_best)) {
        members = members.sort((a, b) => b.order.length - a.order.length);
      }

      if (take > 0) {
        members = members.slice(0, take);
      }

      let orderMemberOne = 0;
      let orderMemberMany = 0;
      const dataMember = members.map((item) => {
        const totalOrder = item.order.length;

        if (item.order.length > 1) {
          orderMemberMany += 1;
        } else if (item.order.length === 1) {
          orderMemberOne += 1;
        }
        const totalUnpaid = item.order
          .filter((order) =>
            order?.quotation[0]?.receipt_quotation !== null
          )
          .reduce((total, order) => total + Number(order.grand_total), 0);

        const totalPaid = item.order
          .filter(
            (order) =>
              order?.quotation[0]?.receipt_quotation === null,
          )
          .reduce((total, order) => total + Number(order.grand_total), 0);

        return {
          ...item,
          total_order: totalOrder,
          total_unpaid: totalUnpaid,
          total_paid: totalPaid,
        };
      });

      const count = await this.dbService.members.count({
        where,
      });

      return {
        data: dataMember,
        meta: {
          totalOrderOne: orderMemberOne,
          totalOrderMany: orderMemberMany,
          total: count,
          page,
          take,
          takeTotal: members.length,
        },
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const member = await this.dbService.members.findFirst({
        where: { id: id },
        include: {
          join_location_store: true,
          order: {
            include: {
              complaints: true,
              store: true,
              status: true,
              sales: true,
              m_order_details: true,
            },
            orderBy: {
              created_at: 'desc',
            },
          },
        },
      });

      return member;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async update(id: number, updateMemberDto: UpdateMemberDto, user_id) {
    try {
      const updated_member = await this.dbService.members.update({
        where: { id: id },
        data: {
          full_name: updateMemberDto.full_name,
          email: updateMemberDto.email,
          address_1: updateMemberDto.address_1,
          address_2: updateMemberDto.address_2,
          join_date: updateMemberDto.join_date
            ? new Date(updateMemberDto.join_date)
            : undefined,
          phone_number: updateMemberDto.phone_number,
          whatsapp_number: updateMemberDto.whatsapp_number,
          zip_code: updateMemberDto.zip_code,
          join_location: updateMemberDto.join_location
            ? updateMemberDto.join_location
            : undefined,
          area_id: updateMemberDto.area_id,
          rating: updateMemberDto.rating,
          updated_at: new Date(),
          updated_by: user_id,
        },
        include: {
          join_location_store: true,
        },
      });

      return updated_member;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async remove(id: number, user_id) {
    try {
      const delete_member = await this.dbService.members.update({
        where: { id: id },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      return delete_member;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  //FIXME: FIX JIKA PRISMA SUDAH LIMIT
  async memberExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const { search, date_from, date_to, store_id, top_best } = queryParams;
      const where: Prisma.membersWhereInput = {
        AND: [
          ...(search
            ? [
              {
                OR: [
                  { whatsapp_number: { contains: search } },
                  { member_number: { contains: search } },
                ],
              },
            ]
            : []),
          ...(store_id
            ? [{ join_location_store: { id: { in: store_id } } }]
            : []),
          // ...(date_from && date_to
          //   ? [
          //       {
          //         created_at: {
          //           gte: new Date(date_from),
          //           lte: new Date(`${date_to}T23:59:59.000Z`),
          //         },
          //       },
          //     ]
          //   : []),
        ].filter(Boolean),
        deleted_at: null,
      };

      const count = await this.dbService.members.count({ where });

      let dataExcel = [];
      const takeData = 900;
      let skipData = 0;
      const countTake = Math.floor(count / takeData);

      for (let i = 0; i <= countTake; i++) {
        skipData = i * takeData;
        const members = await this.dbService.members.findMany({
          where,
          skip: skipData,
          take: takeData,
          include: {
            join_location_store: true,
            area: true,
            order: {
              where: {
                ...(date_from && date_to
                  ? {
                    created_at: {
                      gte: new Date(date_from),
                      lte: new Date(`${date_to}T23:59:59.000Z`),
                    },
                  }
                  : {}),
              },
              include: {
                quotation: true,
                complaints: true,
                status: true,
                store: true,
                sales: true,
                m_order_details: true,
              },
              orderBy: {
                created_at: 'desc',
              },
            },
          },
        });

        if (Boolean(top_best)) {
          members.sort((a, b) => b.order.length - a.order.length);
        }

        const dataBatch = members.map((item) => {
          const totalUnpaid = item.order
            .filter((order) =>
              order?.quotation[0]?.receipt_quotation === null
            )
            .reduce((total, order) => total + Number(order.grand_total), 0);

          const totalPaid = item.order
            .filter(
              (order) =>
                order?.quotation[0]?.receipt_quotation !== null
            )
            .reduce((total, order) => total + Number(order.grand_total), 0);

          const comparisonPaidUnpaid = totalPaid - totalUnpaid;

          return {
            ...item,
            total_order: item.order.length,
            total_unpaid: totalUnpaid,
            total_paid: totalPaid,
            comparison_paid_unpaid: comparisonPaidUnpaid,
          };
        });

        dataExcel = [...dataExcel, ...dataBatch];
      }

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Member ', {
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
        { header: 'Member Id', key: 'id', width: 20 },
        { header: 'Nama Toko', key: 'store_name', width: 35 },
        { header: 'Nama Customers', key: 'full_name', width: 35 },
        { header: 'Join Date', key: 'join_date', width: 35 },
        { header: 'Email Member', key: 'email', width: 35 },
        { header: 'Phone Number', key: 'phone_number', width: 35 },
        { header: 'Whatsapp Number', key: 'whatsapp_number', width: 35 },
        { header: 'Member Number', key: 'member_number', width: 35 },
        { header: 'Alamat', key: 'address', width: 50 },
        { header: 'Total Order', key: 'total_order', width: 35 },
        { header: 'Total Unpaid', key: 'total_unpaid', width: 35 },
        { header: 'Total Paid', key: 'total_paid', width: 35 },
        {
          header: 'Comparison Paid-Unpaid',
          key: 'comparison_paid_unpaid',
          width: 35,
        },
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
      const formattedDateTime = (dateTime) =>
        `${new Date(dateTime).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}, ${new Date(dateTime).toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;

      dataExcel.forEach((member) => {
        const row = worksheet.addRow({
          id: member.id,
          store_name: member.join_location_store
            ? member.join_location_store.store_name
            : '',
          full_name: member.full_name ? member.full_name : '',
          join_date: member.join_date
            ? formattedDateTime(member.join_date)
            : '',
          email: member.email ? member.email : '',
          phone_number: member.phone_number ? member.phone_number : '',
          whatsapp_number: member.whatsapp_number ? member.whatsapp_number : '',
          member_number: member.member_number,
          address: member.address_1 ? member.address_1 : member.address_2,
          total_order: member.total_order,
          total_unpaid: member.total_unpaid,
          total_paid: member.total_paid,
          comparison_paid_unpaid: member.comparison_paid_unpaid,
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

      const createExcelFilePath = (baseName) => {
        const folderPath = './storage/excel/member';
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

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const generateExcelFile = async (data, res) => {
        const baseName = `DataMember-${getFormattedDate()}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(dataExcel, res);
    } catch (error) {
      throw error;
    }
  }

  async orderMemberExportExcel(res: Response, queryParams: QueryParamsDto) {
    const {
      search,
      status,
      date_from,
      date_to,
      order_by,
      sales_id,
      payment_type,
      store_id,
      vendor_id,
      work_order_status,
      promotion,
    } = queryParams;


    const where: Prisma.ordersWhereInput = {
      AND: [
        ...(search
          ? [
            {
              OR: [
                { receipt_number: { contains: search } },
                { members: { full_name: { contains: search } } },
                {
                  store: {
                    store_name: {
                      contains: search,
                    },
                  },
                },
                {
                  project_number: {
                    contains: search,
                  },
                },
              ],
            },
          ]
          : []),
        ...(sales_id ? [{ sales_id: { equals: sales_id } }] : []),
        ...(status ? [{ status: { id: { in: status } } }] : []),
        ...(work_order_status
          ? [{ work_orders: { status: { id: { in: work_order_status } } } }]
          : []),
        ...(payment_type ? [{ payment_type: { equals: payment_type } }] : []),
        store_id
          ? {
            store_id: {
              in: store_id,
            },
          }
          : undefined,
        vendor_id
          ? {
            vendor: {
              id: vendor_id,
              deleted_at: null,
            },
          }
          : undefined,
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
        ...(promotion
          ? [
            {
              OR: [
                {
                  payment_type: 'gratis',
                },
                {
                  quotation: {
                    some: {
                      promotion_id: {
                        not: null,
                      },
                    },
                  },
                },
                {
                  status: {
                    category: 'WORKEND',
                  },
                },
              ],
            },
          ]
          : []),
      ].filter(Boolean),
      deleted_at: null,
    };

    const count = await this.dbService.orders.count({
      where,
    });

    let dataExcel = [];
    const takeData = 900;
    let skipData = 0;
    const countTake = Math.floor(count / takeData);

    for (let i = 0; i < countTake; i++) {
      skipData = i * takeData;
      const data = await this.dbService.orders.findMany({
        where,
        skip: skipData,
        take: takeData,
        orderBy: {
          created_at: order_by,
        },
        include: {
          members: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              area_id: true,
              area: true,
              join_location: true,
              member_number: true,
              full_name: true,
              email: true,
              phone_number: true,
              whatsapp_number: true,
              address_1: true,
              address_2: true,
              zip_code: true,
              rating: true,
              join_date: true,
              created_at: true,
              updated_at: true,
              created_by: true,
              updated_by: true,
            },
          },
          sales: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              store_id: true,
              user_id: true,
              full_name: true,
              nik: true,
              bank_id: true,
              bank_branch: true,
              account_name: true,
              is_active: true,
              created_at: true,
              updated_at: true,
              created_by: true,
              updated_by: true,
            },
          },
          store: {
            select: {
              id: true,
              store_name: true,
              address: true,
              area_id: true,
              area: true,
              zip_code: true,
              created_at: true,
              updated_at: true,
              created_by: true,
              updated_by: true,
            },
          },
          status: {
            select: {
              id: true,
              category: true,
              description: true,
            },
          },

          vendor: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              company_name: true,
              address: true,
              phone_number: true,
              is_active: true,
              work_orders: {
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
            },
          },
          m_order_details: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              order_id: true,
              item_code: true,
              item_name: true,
              item_notes: true,
              item_id: true,
              item: {
                select: {
                  id: true,
                  item_name: true,
                  category: true,
                  default_price: true,
                  service_name: true,
                },
              },
              sales: true,
              unit_price: true,
              quantity: true,
              total: true,
              comission: true,
              created_by: true,
              created_at: true,
            },
          },
          quotation: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            include: {
              promotion: true,
              quotation_details: {
                include: {
                  item: true,
                },
              },
              quotation_files: true,
            },
          },
          work_orders: {
            where: {
              deleted_at: null,
            },
            include: {
              request_tukang: {
                include: {
                  tukang_to_request_tukang: true,
                  tukang_to_replace_tukang: true,
                },
              },
              vendor: true,
              work_order_evidences: true,
              work_order_tukang: {
                include: {
                  tukang: true,
                },
              },
              work_order_status: {
                include: {
                  status: true,
                  work_order_items: {
                    include: {
                      item: true,
                    },
                    where: {
                      deleted_at: null,
                      deleted_by: null,
                    },
                  },
                },
                orderBy: {
                  created_at: 'desc',
                },
              },
            },
          },
        },
      });
      dataExcel = [...dataExcel, ...data];
    }

    if (count != dataExcel.length) {
      const data = await this.dbService.orders.findMany({
        where,
        skip: skipData,
        take: takeData,
        orderBy: {
          member_id: order_by,
        },
        include: {
          members: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              area_id: true,
              area: true,
              join_location: true,
              member_number: true,
              full_name: true,
              email: true,
              phone_number: true,
              whatsapp_number: true,
              address_1: true,
              address_2: true,
              zip_code: true,
              rating: true,
              join_date: true,
              created_at: true,
              updated_at: true,
              created_by: true,
              updated_by: true,
            },
          },
          invoice_details: {
            where: {
              deleted_at: null,
            },
            select: {
              invoices: {
                select: {
                  id: true,
                  status: true,
                  total_amount: true,
                  invoice_logs: true,
                  description: true,
                  vendor: true,
                },
              },
            },
          },
          sales: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              store_id: true,
              user_id: true,
              full_name: true,
              nik: true,
              bank_id: true,
              bank_branch: true,
              account_name: true,
              is_active: true,
              created_at: true,
              updated_at: true,
              created_by: true,
              updated_by: true,
            },
          },
          store: {
            select: {
              id: true,
              store_name: true,
              address: true,
              area_id: true,
              area: true,
              zip_code: true,
              created_at: true,
              updated_at: true,
              created_by: true,
              updated_by: true,
            },
          },
          status: {
            select: {
              id: true,
              category: true,
              description: true,
            },
          },
          complaints: true,
          vendor: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              company_name: true,
              address: true,
              phone_number: true,
              is_active: true,
              work_orders: {
                where: {
                  deleted_at: null,
                  deleted_by: null,
                },
              },
            },
          },
          order_history: {
            select: {
              order_id: true,
              created_at: true,
              status: {
                select: {
                  id: true,
                  category: true,
                  description: true,
                },
              },
            },
          },
          m_order_details: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            select: {
              id: true,
              order_id: true,
              item_code: true,
              item_name: true,
              item_notes: true,
              item_id: true,
              item: {
                select: {
                  id: true,
                  item_name: true,
                  category: true,
                  default_price: true,
                  service_name: true,
                },
              },
              sales: true,
              unit_price: true,
              quantity: true,
              total: true,
              comission: true,
              created_by: true,
              created_at: true,
            },
          },
          quotation: {
            where: {
              deleted_at: null,
              deleted_by: null,
            },
            include: {
              promotion: true,
              quotation_details: {
                include: {
                  item: true,
                },
              },
              quotation_files: true,
            },
          },
          work_orders: {
            where: {
              deleted_at: null,
            },
            include: {
              request_tukang: {
                include: {
                  tukang_to_request_tukang: true,
                  tukang_to_replace_tukang: true,
                },
              },
              vendor: true,
              work_order_evidences: true,
              work_order_tukang: {
                include: {
                  tukang: true,
                },
              },
              work_order_status: {
                include: {
                  status: true,
                  work_order_items: {
                    include: {
                      item: true,
                    },
                    where: {
                      deleted_at: null,
                      deleted_by: null,
                    },
                  },
                },
                orderBy: {
                  created_at: 'desc',
                },
              },
            },
          },
          order_files: true,
        },
      });
      dataExcel = [...dataExcel, ...data];
    }

    // Log data to verify it is fetched correctly
    // console.log('Fetched Data:', data);

    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Data Order', {
      properties: {
        tabColor: {
          argb: 'FF00FF00',
        },
        outlineLevelCol: 2,
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
      { header: 'Order Id', key: 'id', width: 10 },
      { header: 'Nama Toko', key: 'store_name', width: 25 },
      { header: 'Order Dibuat ', key: 'created_at', width: 30 },
      { header: 'Tanggal Request Survey', key: 'request_survey', width: 35 },
      { header: 'Tanggal Request Pengerjaan', key: 'request_work', width: 35 },
      { header: 'Nama Customer', key: 'full_name', width: 40 },
      { header: 'Phone Number', key: 'phone_number', width: 30 },
      { header: 'Payment Type', key: 'payment_type', width: 30 },
      { header: 'Nomor Receipt', key: 'receipt_number', width: 30 },
      { header: 'Order Status', key: 'status_order', width: 30 },
      { header: 'Tanggal Survey', key: 'survey_date', width: 40 },
      { header: 'Tanggal Pengerjaan', key: 'work_date', width: 55 },
      { header: 'Nama Vendor', key: 'company_name', width: 35 },
      { header: 'Nama Tukang', key: 'tukang_name', width: 30 },
      { header: 'Nama Sales', key: 'sales_name', width: 35 },
      { header: 'Grand Total', key: 'grand_total', width: 25 },
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
    let totalGrandTotalValue = 0;

    dataExcel.forEach((order) => {
      const tukangName = order?.work_orders?.work_order_tukang
        ? [
          ...new Set(
            order.work_orders.work_order_tukang.map(
              (item) => item?.tukang?.full_name,
            ),
          ),
        ].join(', ')
        : 'Tukang belum ditugaskan';
      const formattedDateTime = (dateTime) =>
        `${new Date(dateTime).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}, ${new Date(dateTime).toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
      const grandTotal = Number(order.grand_total);
      const formattedGrandTotal: number = grandTotal ? grandTotal : 0;
      let grandTotalValue = formattedGrandTotal;

      let grandTotalSurveyValue = 0;
      let quotationGrandTotalValue = 0;

      if (order.payment_type === 'survey') {
        const grandTotalSurvey = Number(order.grand_total);
        const quotationGrandTotal =
          order && order.quotation && order.quotation.length > 0
            ? Math.ceil(Number(order.quotation[0]?.quotation_grand_total || 0))
            : 0;

        if (!isNaN(grandTotalSurvey) && !isNaN(quotationGrandTotal)) {
          grandTotalSurveyValue = grandTotalSurvey;
          quotationGrandTotalValue = quotationGrandTotal;
          totalGrandTotalValue += grandTotalSurvey + quotationGrandTotal;
          grandTotalValue = grandTotalSurvey + quotationGrandTotal;
        } else {
          grandTotalValue = 0;
        }
      }

      totalGrandTotalValue +=
        !isNaN(Number()) && order.payment_type != 'survey'
          ? Number(grandTotal)
          : 0;

      const row = worksheet.addRow({
        id: order.id,
        store_name: order.store ? order.store.store_name : 'N/a',
        created_at: formattedDateTime(order.created_at),
        request_survey: order.request_survey
          ? formattedDateTime(order.request_survey)
          : 'Tanggal Belum Ditentukan',
        request_work: order.request_work
          ? formattedDateTime(order.request_work)
          : 'Tanggal Belum Ditentukan',
        full_name: order.members ? order.members.full_name : 'N/a',
        phone_number:
          order?.members?.phone_number ??
          order?.members?.whatsapp_number ??
          order?.members?.member_number ??
          'N/a',
        payment_type:
          order.payment_type === 'pemasangan_tanpa_survey'
            ? 'Pemasangan Tanpa Survey'
            : order.payment_type === 'survey'
              ? 'Survey'
              : order.payment_type === 'gratis'
                ? 'Gratis'
                : 'N/a',
        receipt_number: order.receipt_number
          ? order.receipt_number
          : 'Receipt belum terbit',
        status_order:
          order?.status?.description ?? 'Order Tidak Memiliki Status',
        survey_date: order?.work_orders?.survey_date
          ? formattedDateTime(order.work_orders.survey_date)
          : 'Order Tidak Ada Tanggal Survey',
        work_date:
          order?.work_orders?.work_start_date &&
            order?.work_orders?.work_end_date
            ? `${formattedDateTime(
              order.work_orders.work_start_date,
            )} - ${formattedDateTime(order.work_orders.work_end_date)}`
            : 'Order Tidak Ada Tanggal Survey',
        company_name: order.vendor ? order.vendor.company_name : '-',
        tukang_name: tukangName,
        sales_name: order.sales ? order.sales.full_name : 'N/a',
        grand_total: grandTotalValue,
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

    const totalRow = worksheet.addRow({
      id: 'Total',
      store_name: '',
      created_at: '',
      request_survey: '',
      request_work: '',
      full_name: '',
      phone_number: '',
      payment_type: '',
      receipt_number: '',
      status_order: '',
      survey_date: '',
      work_date: '',
      company_name: '',
      tukang_name: '',
      sales_name: '',
      grand_total: Number(totalGrandTotalValue),
    });

    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    totalRow.height = 30;

    worksheet.mergeCells(`A${totalRow.number}:O${totalRow.number}`);

    const getFormattedDate = () => {
      const now = new Date();
      const tahun = now.getFullYear();
      const bulan = String(now.getMonth() + 1).padStart(2, '0');
      const tanggal = String(now.getDate()).padStart(2, '0');
      return `${tahun}-${bulan}-${tanggal}`;
    };

    const createExcelFilePath = (baseName: string) => {
      const folderPath = './storage/excel/order';
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      const now = Date.now();

      const excelFileName = `${baseName}-${now}.xlsx`;
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
      const baseName = `DataOrder-${formattedDate}`;
      const excelFilePath = createExcelFilePath(baseName);

      await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
    };

    return await generateExcelFile(res);
  }
  catch(error) {
    console.error('Error:', error);
    throw error;
  }
}
