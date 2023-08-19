import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateVendorAreaDto } from './dto/create-vendor_area.dto';
import { UpdateVendorAreaDto } from './dto/update-vendor_area.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class VendorAreaService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createVendorAreaDto: CreateVendorAreaDto, user_id: number) {
    try {
      const vendor = await this.dbService.vendor.findFirst({
        where: {
          id: createVendorAreaDto.vendor_id
        }
      })

      if (vendor.is_active == true) {
        const vendor_area = await this.dbService.vendor_area.create({
          data: {
            default_discount: createVendorAreaDto.default_discount,
            default_markup: createVendorAreaDto.default_markup,
            default_unit: createVendorAreaDto.default_unit,
            created_by: user_id,
            store: {
              connect: {
                id: createVendorAreaDto.area_serve
              }
            },
            vendor: {
              connect: {
                id: createVendorAreaDto.vendor_id
              }
            },

          }
        })
        return {
          status: HttpStatus.CREATED,
          message: 'Successfully to Create Data'
        }
      } else {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Vendor is not Active'
        }
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
      const vendor_area = await this.dbService.vendor_area.findMany()

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: vendor_area
      }
    } catch (error) {
      return {
        status: HttpStatus.OK,
        message: 'Failed to Get Data'
      }
    }
  }

  async findOne(id: number) {
    try {
      const vendor_area = await this.dbService.vendor_area.findFirst({
        where: {
          id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: vendor_area
      }
    } catch (error) {
      return {
        status: HttpStatus.OK,
        message: 'Failed to Find Data'
      }
    }
  }

  async update(id: number, updateVendorAreaDto: UpdateVendorAreaDto, user_id: number) {
    try {
      const vendor = await this.dbService.vendor.findFirst({
        where: {
          id: updateVendorAreaDto.vendor_id
        }
      })

      if (vendor.is_active == true) {
        const vendor_area = await this.dbService.vendor_area.update({
          where: {
            id
          },
          data: {
            default_discount: updateVendorAreaDto.default_discount,
            default_markup: updateVendorAreaDto.default_markup,
            default_unit: updateVendorAreaDto.default_unit,
            updated_by: user_id,
            updated_at: new Date(),
            store: {
              connect: {
                id: updateVendorAreaDto.area_serve
              }
            },
            vendor: {
              connect: {
                id: updateVendorAreaDto.vendor_id
              }
            },

          }
        })
        return {
          status: HttpStatus.CREATED,
          message: 'Successfully to Update Data'
        }
      } else {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Vendor is not Active'
        }
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
      const vendor_area = await this.dbService.vendor_area.update({
        where: {
          id
        },
        data: {
          is_active: false,
          deleted_at: new Date(),
          deleted_by: user_id
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
