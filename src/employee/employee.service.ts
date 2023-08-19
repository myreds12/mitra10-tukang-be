import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { createApiPropertyDecorator } from '@nestjs/swagger/dist/decorators/api-property.decorator';

@Injectable()
export class EmployeeService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createEmployeeDto: CreateEmployeeDto, user_id: number) {
    try {

      let full_name = createEmployeeDto.first_name;

      if (createEmployeeDto.middle_name) {
        full_name += ` ${createEmployeeDto.middle_name}`;
      }

      if (createEmployeeDto.last_name) {
        full_name += ` ${createEmployeeDto.last_name}`;
      }
      const employee = await this.dbService.employee.create({
        data: {
          first_name: createEmployeeDto.first_name,
          middle_name: createEmployeeDto.middle_name,
          last_name: createEmployeeDto.middle_name,
          full_name: full_name,
          birth: new Date(createEmployeeDto.birth),
          email: createEmployeeDto.email,
          gender: createEmployeeDto.gender,
          nik: createEmployeeDto.nik,
          phone_number: createEmployeeDto.phone_number,
          whatsapp_number: createEmployeeDto.whatsapp_number,
          users: {
            connect: {
              id: user_id
            }
          },
          store: {
            connect: {
              id: createEmployeeDto.store_id
            }
          },
          positions: {
            connect: {
              id: createEmployeeDto.position_id
            }
          },
          created_by: user_id
        }
      })

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Create Data'
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Create Data'
      }
    }
  }

  async findAll() {
    try {
      const employee = await this.dbService.employee.findMany()

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: employee
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Get Data'
      }
    }
  }

  async findOne(id: number) {
    try {
      const employee = await this.dbService.employee.findFirst({
        where: {
          id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: employee
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data'
      }
    }
  }

  async update(id: number, updateEmployeeDto: UpdateEmployeeDto, user_id: number) {
    try {

      let full_name = updateEmployeeDto.first_name;

      if (updateEmployeeDto.middle_name) {
        full_name += ` ${updateEmployeeDto.middle_name}`;
      }

      if (updateEmployeeDto.last_name) {
        full_name += ` ${updateEmployeeDto.last_name}`;
      }
      const employee = await this.dbService.employee.update({
        where: {
          id
        },
        data: {
          first_name: updateEmployeeDto.first_name,
          middle_name: updateEmployeeDto.middle_name,
          last_name: updateEmployeeDto.middle_name,
          full_name: full_name,
          birth: new Date(updateEmployeeDto.birth),
          email: updateEmployeeDto.email,
          gender: updateEmployeeDto.gender,
          nik: updateEmployeeDto.nik,
          phone_number: updateEmployeeDto.phone_number,
          whatsapp_number: updateEmployeeDto.whatsapp_number,
          users: {
            connect: {
              id: user_id
            }
          },
          store: {
            connect: {
              id: updateEmployeeDto.store_id
            }
          },
          positions: {
            connect: {
              id: updateEmployeeDto.position_id
            }
          },
          updated_at: new Date(),
          updated_by: user_id
        }
      })

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Update Data'
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Update Data'
      }
    }
  }

  async remove(id: number, user_id: number) {
    try {
      const employee = await this.dbService.employee.update({
        where: {
          id
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Delete Data'
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Delete Data'
      }
    }
  }
}
