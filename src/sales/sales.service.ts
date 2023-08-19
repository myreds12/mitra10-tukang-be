import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateSalesDto } from './dto/create-sale.dto';
import { UpdateSalesDto } from './dto/update-sale.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SalesService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createSalesDto: CreateSalesDto, user_id: number) {
    try {
      const bank = await this.dbService.bank.findFirst({
        where: {
          id: createSalesDto.bank_id
        }
      })
      if (bank.is_active == true) {
        const sales = await this.dbService.sales.create({
          data: {
            full_name: createSalesDto.account_name,
            bank_branch: createSalesDto.bank_branch,
            account_name: createSalesDto.account_name,
            nik: createSalesDto.nik,
            users: {
              connect: {
                id: user_id
              }
            },
            store: {
              connect: {
                id: createSalesDto.store_id
              }
            },
            bank: {
              connect: {
                id: createSalesDto.bank_id
              }
            }
          }
        })

        return {
          status: HttpStatus.CREATED,
          message: 'Successfully to Create Data'
        }
      } else {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Bank is not Active'
        }
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST
      }
    }
  }

  async findAll() {
    try {
      const sales = await this.dbService.sales.findMany()

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: sales
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
      const sales = await this.dbService.sales.findFirst({
        where: {
          id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: sales
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data'
      }
    }
  }

  async update(id: number, updateSalesDto: UpdateSalesDto, user_id: number) {
    try {
      const sales = await this.dbService.sales.update({
        where: {
          id
        },
        data: {
          full_name: updateSalesDto.account_name,
          bank_branch: updateSalesDto.bank_branch,
          account_name: updateSalesDto.account_name,
          nik: updateSalesDto.nik,
          updated_at: new Date(),
          updated_by: user_id,
          users: {
            connect: {
              id: user_id
            }
          },
          store: {
            connect: {
              id: updateSalesDto.store_id
            }
          },
          bank: {
            connect: {
              id: updateSalesDto.bank_id
            }
          }
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Update Data',
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
      const sales = await this.dbService.sales.update({
        where: {
          id
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
          is_active: false
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to delete Data',
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Delete Data'
      }
    }
  }
}
