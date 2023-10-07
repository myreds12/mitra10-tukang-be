import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash } from 'bcrypt';
@Injectable()
export class VendorService {
  constructor(private readonly dbService: PrismaService) {}
  async create(createVendorDto: CreateVendorDto, user_id: number) {
    try {
      const vendor = await this.dbService.vendor.create({
        data: {
          address: createVendorDto.address,
          company_name: createVendorDto.company_name,
          email_address: createVendorDto.email_address,
          phone_number: createVendorDto.phone_number,
          // city: {
          //   connect: {
          //     id: createVendorDto.city_id,
          //   },
          // },
          users: {
            connect: {
              id: user_id,
            },
          },
          join_date: new Date(),
          created_by: user_id,
        },
      });
      const user = await this.dbService.users.create({
        data: {
          username: `${vendor.company_name}`,
          password: await hash('tukanginwebsite165', 10),
          role_id: 5
        },
      });
      // const create_user_roles = await this.dbService.user_roles.create({
      //   data: {
      //     users: {
      //       connect: { id: user.id }, // Assuming user_id is the ID of the user you're connecting
      //     },
      //     roles: {
      //       connect: { id: 1 }, // Assuming 1 is the ID of the role you're connecting
      //     },
      //   },
      // });
      // const user_data = await this.dbService.user_roles.findUnique({
      //   where: { id: create_user_roles.id },
      //   include: { users: true, roles: true },
      // });
      return {
        data: {
          vendor: vendor,
          user_data: user,
        },
        status: HttpStatus.CREATED,
        message: 'Successfully to Create Data',
      };
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Create Data',
      };
    }
  }

  async findAll() {
    try {
      const vendor = await this.dbService.vendor.findMany();

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: vendor,
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Get Data',
      };
    }
  }

  async findOne(id: number) {
    try {
      const vendor = await this.dbService.vendor.findFirst({
        where: {
          id,
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: vendor,
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data',
      };
    }
  }

  async update(id: number, updateVendorDto: UpdateVendorDto, user_id: number) {
    try {
      const vendor = await this.dbService.vendor.update({
        where: {
          id,
        },
        data: {
          address: updateVendorDto.address,
          company_name: updateVendorDto.company_name,
          email_address: updateVendorDto.email_address,
          phone_number: updateVendorDto.phone_number,
          users: {
            connect: {
              id: user_id,
            },
          },
          join_date: new Date(updateVendorDto.join_date),
          updated_by: user_id,
          updated_at: new Date(),
        },
      });

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Update Data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Update Data',
      };
    }
  }

  async remove(id: number, user_id: number) {
    try {
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

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Delete Data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Delete Data',
      };
    }
  }
}
