import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateTukangDto } from './dto/create-tukang.dto';
import { UpdateTukangDto } from './dto/update-tukang.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash } from 'bcrypt';

@Injectable()
export class TukangService {
  constructor(private readonly dbService: PrismaService) {}
  async create(
    createTukangDto: CreateTukangDto,
    user_id: number,
    file: Express.Multer.File,
  ) {
    try {
      const vendor = await this.dbService.vendor.findFirst({
        where: {
          id: Number(createTukangDto.vendor_id),
        },
      });

      const url = `/uploads/tukang/${file.filename}`;

      if (vendor.is_active == true) {
        const user = await this.dbService.users.create({
          data: {
            username: `${createTukangDto.full_name}`,
            password: await hash('tukanginwebsite165', 10),
          },
        });
        const tukang_roles = await this.dbService.roles.findFirst({
          where: {
            name: {
              contains: 'tukang',
            },
          },
        });

        const create_user_roles = await this.dbService.user_roles.create({
          data: {
            users: {
              connect: { id: user.id },
            },
            roles: {
              connect: { id: tukang_roles.id },
            },
          },
        });

        const tukang = await this.dbService.tukang.create({
          data: {
            full_name: createTukangDto.full_name,
            email: createTukangDto.email,
            ktp_number: createTukangDto.ktp_number,
            ktp_path: url,
            created_by: user_id,
            join_date: new Date(createTukangDto.join_date),
            users: {
              connect: {
                id: user.id,
              },
            },
            vendor: {
              connect: {
                id: Number(createTukangDto.vendor_id),
              },
            },
          },
        });
        const user_data = await this.dbService.user_roles.findUnique({
          where: { id: create_user_roles.id },
          include: { users: true, roles: true },
        });
        return {
          data: {
            tukang,
            user_data,
          },
          status: HttpStatus.CREATED,
          message: 'Successfully to Create Data',
        };
      } else {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Vendor is not Active',
        };
      }
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
      const tukang = await this.dbService.tukang.findMany();

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: tukang,
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
      const tukang = await this.dbService.tukang.findFirst({
        where: {
          id,
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: tukang,
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data',
      };
    }
  }

  async update(
    id: number,
    updateTukangDto: UpdateTukangDto,
    user_id: number,
    file?: Express.Multer.File,
  ) {
    try {
      const vendor = await this.dbService.vendor.findFirst({
        where: {
          id: Number(updateTukangDto.vendor_id),
        },
      });

      const url = `/uploads/tukang/${file.filename}`;

      if (vendor.is_active == true) {
        const tukang = await this.dbService.tukang.update({
          where: {
            id,
          },
          data: {
            full_name: updateTukangDto.full_name,
            email: updateTukangDto.email,
            ktp_number: updateTukangDto.ktp_number,
            ktp_path: url,
            updated_by: user_id,
            updated_at: new Date(),
            join_date: new Date(updateTukangDto.join_date),
            users: {
              connect: {
                id: user_id,
              },
            },
            vendor: {
              connect: {
                id: Number(updateTukangDto.vendor_id),
              },
            },
          },
        });

        return {
          status: HttpStatus.CREATED,
          message: 'Successfully to Update Data',
        };
      } else {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Vendor is not Active',
        };
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Update Data',
      };
    }
  }

  async remove(id: number, user_id: number) {
    try {
      const tukang = await this.dbService.tukang.update({
        where: {
          id,
        },
        data: {
          is_active: false,
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      return {
        status: HttpStatus.OK,
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
