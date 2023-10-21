import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash } from 'bcrypt';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { Prisma, users } from '@prisma/client';
import { UpdateOrderDto } from 'src/order/dto/update-order.dto';
@Injectable()
export class VendorService {
  constructor(private readonly dbService: PrismaService) {}
  async create(
    files: VendorFiles,
    createVendorDto: CreateVendorDto,
    user: users,
  ) {
    const { id: user_id } = user;
    console.log(createVendorDto);

    const vendorFiles: Array<Prisma.vendor_documentCreateManyInput> =
      Object.entries(files).map((file) => {
        if (file[1].length) {
          const newFile = file[1].map((item) => ({
            document_name: file[0],
            path: item.filename,
            created_by: user_id,
          }));

          return newFile;
        }
      });

    const vendorAreaData: Prisma.vendor_areaCreateManyInput[] =
      createVendorDto.city_id.map((city_id) => ({
        city_id,
        default_discount: createVendorDto.discount,
        default_markup: createVendorDto.markup,
        created_by: user_id,
      }));

    const vendorBankData: Prisma.vendor_bankCreateInput = {
      account_name: createVendorDto.account_name,
      account_number: createVendorDto.account_number,
      bank: {
        connect: {
          id: createVendorDto.bank_id,
        },
      },
      created_by: user_id,
    };

    const vendorServiceData: Prisma.vendor_serviceCreateManyInput[] =
      createVendorDto.service_type_id.map((item) => {
        return {
          service_type_id: item,
        };
      });

    const vendorData: Prisma.vendorCreateInput = {
      users: {
        connect: {
          id: user_id,
        },
      },
      address: createVendorDto.address,
      company_name: createVendorDto.company_name,
      email_address: createVendorDto.email_address,
      phone_number: createVendorDto.phone_number,
      ktp_number: createVendorDto.ktp_number,
      npwp_number: createVendorDto.npwp_number,
      join_date: createVendorDto.join_date
        ? new Date(createVendorDto.join_date)
        : null,
      created_by: user_id,
      vendor_document: {
        createMany: {
          data: vendorFiles.flat(),
        },
      },
      vendor_area: {
        createMany: {
          data: vendorAreaData,
        },
      },
      vendor_bank: {
        create: vendorBankData,
      },
      vendor_service: {
        createMany: {
          data: vendorServiceData,
        },
      },
    };

    const users = await this.dbService.users.create({
      data: {
        username: `${createVendorDto.pic_name}`,
        password: await hash('password', 10),
        role_id: 5,
      },
    });

    const [vendor] = await this.dbService.$transaction([
      this.dbService.vendor.create({
        data: vendorData,
      }),
    ]);

    return { vendor, users };
  }

  async findAll(query: QueryParamsDto) {
    const { take, page, search, status, date_from, date_to } = query;
    const skip = page * take - take;
    const countTotal = await this.dbService.vendor.count();

    const where: Prisma.vendorWhereInput = {
      AND: [
        ...(search
          ? [
              {
                OR: [
                  { phone_number: { contains: search } },
                  { email_address: { contains: search } },
                  { company_name: { contains: search } },
                ],
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
    };
    const vendor = await this.dbService.vendor.findMany({
      where,
      skip,
      take: take <= 0 ? undefined : take,
      include: {
        orders: true,
        tukang: true,
        vendor_area: true,
        vendor_bank: true,
        vendor_document: true,
        vendor_service: true,
        work_orders: true,
      },
    });

    return { data: vendor, countTotal, page, take };
  }

  async findOne(id: number) {
    const vendor = await this.dbService.vendor.findFirst({
      where: {
        id,
      },
      include: {
        orders: true,
        tukang: true,
        vendor_area: true,
        vendor_bank: true,
        vendor_document: true,
        vendor_service: true,
        work_orders: true,
      },
    });

    return vendor;
  }

  async update(
    id: number,
    files: VendorFiles,
    updateVendorDto: UpdateVendorDto,
    user: users,
  ) {
    const { id: user_id } = user;
    await this.dbService.vendor_document.deleteMany({
      where: {
        vendor_id: id,
      },
    });

    const vendorFiles: Prisma.vendor_documentCreateManyInput[] = Object.entries(
      files,
    ).map((file) => {
      if (file[1].length) {
        const updateFile = file[1].map((item) => ({
          document_name: file[0],
          path: item.filename,
          created_by: user_id,
        }));
        return updateFile;
      }
    });

    const vendorData: Prisma.vendorUpdateInput = {
      users: {
        connect: {
          id: user_id,
        },
      },
      address: updateVendorDto.address,
      company_name: updateVendorDto.company_name,
      email_address: updateVendorDto.email_address,
      phone_number: updateVendorDto.phone_number,
      ktp_number: updateVendorDto.ktp_number,
      npwp_number: updateVendorDto.npwp_number,
      join_date: updateVendorDto.join_date
        ? new Date(updateVendorDto.join_date)
        : null,
      updated_by: user_id,
      vendor_document: {
        createMany: {
          data: vendorFiles.flat(),
        },
      },
    };

    console.log(vendorData);

    const [vendor] = await this.dbService.$transaction([
      this.dbService.vendor.update({
        where: {
          id,
        },
        data: vendorData,
      }),
    ]);
    return vendor;
  }

  async remove(id: number, user: users) {
    const { id: user_id } = user;
    const vendor = await this.dbService.vendor.update({
      where: {
        id,
      },
      data: {
        deleted_at: new Date(),
        is_active: false,
        deleted_by: user_id,
      },
    });
    return vendor;
  }

  async nextCode(){
    const vendor = await this.dbService.vendor.findMany({
      orderBy: {
        id: 'desc'
      },
      take: 1
    })
    
    return vendor[0] || null;
  }
}
