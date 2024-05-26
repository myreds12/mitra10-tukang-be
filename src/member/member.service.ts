import { Injectable, HttpStatus, BadRequestException } from '@nestjs/common';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs'
import * as path from 'path';

@Injectable()
export class MemberService {
  constructor(private readonly dbService: PrismaService) {}

  //TODO: NAMBAHIN MEMBER NUMBER
  async create(createMemberDto: CreateMemberDto, user_id) {
    try {
      const email_check = await this.dbService.members.findFirst({
        where: { email: createMemberDto.email },
      });

      // const phone_wa_check = await this.dbService.members.findFirst({
      //   where: {
      //     OR: [
      //       ...(createMemberDto?.phone_number
      //         ? [{ phone_number: createMemberDto.phone_number }]
      //         : null),
      //       ...(createMemberDto?.whatsapp_number
      //         ? [{ whatsapp_number: createMemberDto.whatsapp_number }]
      //         : null),
      //     ].filter(Boolean),
      //   },
      // });

      if (email_check && createMemberDto.email)
        throw new BadRequestException('Email already exist!');
      // if (phone_wa_check)
      //   throw new BadRequestException(
      //     'Phone or WhatsApp number already exist!',
      //   );

      const numberMember =
        createMemberDto.phone_number ?? createMemberDto.whatsapp_number;

      // TODO : add condition for numberMember when phone_number or whatsapp_number filled, use that instead
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

  async findAll(query: QueryParamsDto) {
    try {
      const { search, date_from, date_to, store_id } = query;

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
      const member = await this.dbService.members.findMany({
        where,
        include: {
          join_location_store: true,
          area: true,
          order: {
            include: {
              complaints: true,
              store: true,
              sales: true,
              m_order_details: true,
            },
          },
        },
      });
      const memberOrderSummary = member.map((item) => ({
        memberId: item.id,
        totalOrder: item.order.reduce(
          (total, order) => total + Number(order.grand_total),
          0,
        ),
      }));

      const dataMember = member.map((item) => ({
        ...item,
        total_summary:
          memberOrderSummary.find((summary) => summary.memberId === item.id)
            ?.totalOrder || 0,
      }));

      return dataMember;
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
              sales: true,
              m_order_details: true,
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

  async memberExportExcel(res: Response, queryParams: QueryParamsDto) {
    try {
      const data = await this.findAll(queryParams);

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Profile Sales ',
        {
          properties:
          {
            tabColor:
            {
              argb: 'FF4CAF50'
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
              footer: 0.3
            }
          }
        }
      );

      worksheet.columns = [
        { header: 'Member Id', key: 'id', width: 20 },
        { header: 'Lokasi Bergabung', key: 'store_name', width: 35 },
        { header: 'Area', key: 'area', width: 35 },
        { header: 'Nama Member', key: 'full_name', width: 35 },
        { header: 'Email Member', key: 'email', width: 35 },
        { header: 'Phone Number', key: 'phone_number', width: 35 },
        { header: 'Whatsapp Number', key: 'whatsapp_number', width: 35 },
        { header: 'Member Number', key: 'member_number', width: 35 },
        { header: 'Alamat', key: 'address', width: 50 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '0000FF' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });


      data.forEach(member => {
        const row = worksheet.addRow({
          id: member.id,
          store_name: member.join_location_store ? member.join_location_store.store_name : '',
          area: member.area ? member.area.area : '',
          full_name: member.full_name ? member.full_name : '',
          email: member.email ? member.email : '',
          phone_number: member.phone_number ? member.phone_number : '',
          whatsapp_number: member.whatsapp_number ? member.whatsapp_number : '',
          member_number: member.member_number,
          address: member.address_1 ? member.address_1 : member.address_2,
        });

        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
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

      const writeWorkbookAndSendResponse = async (workbook, excelFilePath, res) => {
        await workbook.xlsx.writeFile(excelFilePath);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${path.basename(excelFilePath)}`);

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
      }

      return generateExcelFile(data, res);
    } catch (error) {
      throw error;
    }
  }
}
