import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateVendorBankDto } from './dto/create-vendor_bank.dto';
import { UpdateVendorBankDto } from './dto/update-vendor_bank.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class VendorBankService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createVendorBankDto: CreateVendorBankDto, user_id: number) {
    try {
      const bank = await this.dbService.bank.findFirst({
        where: {
          id: createVendorBankDto.bank_id
        }
      })

      const vendor = await this.dbService.vendor.findFirst({
        where: {
          id: createVendorBankDto.vendor_id
        }
      })

      if (vendor.is_active && bank.is_active == true) {
        const vendor_bank = await this.dbService.vendor_bank.create({
          data: {
            bank: {
              connect: {
                id: createVendorBankDto.bank_id
              }
            },
            vendor: {
              connect: {
                id: createVendorBankDto.vendor_id
              }
            },
            account_name: createVendorBankDto.account_name,
            created_by: user_id
          }
        })

        return {
          status: HttpStatus.CREATED,
          message: 'Successfully to Create Data'
        }
      } else {
        let errorMessage = 'Vendor and/or bank is not active.';
        if (vendor.is_active == false) {
          errorMessage += ' Vendor is not active.';
        }
        if (bank.is_active == false) {
          errorMessage += ' Bank is not active.';
        }

        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: errorMessage,
        };
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
      const vendor_bank = await this.dbService.vendor_bank.findMany()

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: vendor_bank
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
      const vendor_bank = await this.dbService.vendor_bank.findFirst({
        where: {
          id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: vendor_bank
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data'
      }
    }
  }

  async update(id: number, updateVendorBankDto: UpdateVendorBankDto, user_id: number) {
    try {
      const bank = await this.dbService.bank.findFirst({
        where: {
          id: updateVendorBankDto.bank_id
        }
      })

      const vendor = await this.dbService.vendor.findFirst({
        where: {
          id: updateVendorBankDto.vendor_id
        }
      })

      if (vendor.is_active && bank.is_active == true) {
        const vendor_bank = await this.dbService.vendor_bank.update({
          where: {
            id
          },
          data: {
            bank: {
              connect: {
                id: updateVendorBankDto.bank_id
              }
            },
            vendor: {
              connect: {
                id: updateVendorBankDto.vendor_id
              }
            },
            account_name: updateVendorBankDto.account_name,
            updated_by: user_id,
            updated_at: new Date()
          }
        })

        return {
          status: HttpStatus.CREATED,
          message: 'Successfully to Update Data'
        }
      } else {
        let error_message: string
        if (vendor.is_active == false) {
          error_message = ' Vendor is not active.';
        }
        if (bank.is_active == false) {
          error_message = ' Bank is not active.';
        }

        if (bank.is_active && vendor.is_active == false) {
          error_message = 'Bank and Vendor is not active.'
        }

        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: error_message,
        };
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
      const vendor_bank = await this.dbService.vendor_bank.update({
        where: {
          id
        },
        data: {
          deleted_at: new Date(),
          updated_by: user_id,
          is_active: false
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Delete Data'
      }
    } catch (error) {

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Delete Data'
      }
    }
  }
}
