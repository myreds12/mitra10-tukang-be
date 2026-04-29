import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash } from 'bcrypt';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class EmployeeService {
  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
  ) { }
  async create(createEmployeeDto: CreateEmployeeDto, user_id: number) {
    try {
      const position = await this.dbService.positions.findFirst({
        where: {
          id: createEmployeeDto.position_id,
        },
      });

      const roles = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: position.position_name,
          },
        },
      });

      const user = await this.dbService.users.create({
        data: {
          username: createEmployeeDto.email,
          password: await hash(createEmployeeDto.default_password, 10),
          role_id: roles.id,
        },
      });



      const employee = await this.dbService.employee.create({
        data: {
          full_name: createEmployeeDto.full_name,
          birth: new Date(createEmployeeDto.birth),
          email: createEmployeeDto.email,
          nik: createEmployeeDto.nik,
          phone_number: createEmployeeDto.phone_number,
          whatsapp_number: createEmployeeDto.whatsapp_number,
          users: {
            connect: {
              id: user_id,
            },
          },
          store: {
            connect: {
              id: createEmployeeDto.store_id,
            },
          },
          positions: {
            connect: {
              id: position.id,
            },
          },
          created_by: user_id,
        },
      });



      this.emailQueue.add(
        'send-credential-mail',
        {
          username: user.username,
          password: createEmployeeDto.default_password,
        },
        {
          attempts: 3,
        },
      );

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
          employee: employee,
          user_data: user,
        },
        status: HttpStatus.CREATED,
        message: 'Successfully to Create Data',
      };
    } catch (error) {
      throw error
    }
  }

  async findAll(queryParamsDto: QueryParamsDto) {
    const { search, date_to, date_from, page, take } = queryParamsDto;
    const skip = page * take - take;
    const where: Prisma.employeeWhereInput = {
      AND: [
        ...(search
          ? [
            {
              OR: [
                { full_name: { contains: search } },
                { email: { contains: search } },
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
      deleted_at: null,
    };
    const employee = await this.dbService.employee.findMany({
      where,
      skip,
      take: take > 0 ? take : undefined,
      include: {
        positions: true,
        store: true,
        users: true,
      },
    });

    return employee;
  }

  async findOne(id: number) {
    try {
      const employee = await this.dbService.employee.findFirst({
        where: {
          id,
        },
        include: {
          positions: true,
          store: true,
          users: true, 
        }
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: employee,
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
    updateEmployeeDto: UpdateEmployeeDto,
    user_id: number,
  ) {
    try {
      const employee = await this.dbService.employee.update({
        where: {
          id,
        },
        data: {
          full_name: updateEmployeeDto.full_name,
          birth: new Date(updateEmployeeDto.birth),
          email: updateEmployeeDto.email,
          nik: updateEmployeeDto.nik,
          phone_number: updateEmployeeDto.phone_number,
          whatsapp_number: updateEmployeeDto.whatsapp_number,
          users: {
            connect: {
              id: user_id,
            },
          },
          store: {
            connect: {
              id: updateEmployeeDto.store_id,
            },
          },
          positions: {
            connect: {
              id: updateEmployeeDto.position_id,
            },
          },
          updated_at: new Date(),
          updated_by: user_id,
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
      const employee = await this.dbService.employee.update({
        where: {
          id,
        },
        data: {
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
