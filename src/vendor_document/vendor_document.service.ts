import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateVendorDocumentDto } from './dto/create-vendor_document.dto';
import { UpdateVendorDocumentDto } from './dto/update-vendor_document.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class VendorDocumentService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createVendorDocumentDto: CreateVendorDocumentDto, user_id: number, file: Express.Multer.File) {
    try {
      const url = `/uploads/vendor/${file.filename}`

      const vendor = await this.dbService.vendor.findFirst({
        where: {
          id: createVendorDocumentDto.vendor_id
        }
      })

      if (vendor.is_active == true) {
        const vendor_document = await this.dbService.vendor_document.create({
          data: {
            document_name: file.filename,
            path: url,
            vendor: {
              connect: {
                id: createVendorDocumentDto.vendor_id
              }
            },
            created_by: user_id
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
      const vendor_document = await this.dbService.vendor_document.findMany()

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: vendor_document
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
      const vendor_document = await this.dbService.vendor_document.findFirst({
        where: {
          id
        }
      })

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: vendor_document
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data'
      }
    }
  }

  async update(id: number, updateVendorDocumentDto: UpdateVendorDocumentDto, user_id: number, file: Express.Multer.File) {
    try {
      const url = `/uploads/vendor/${file.filename}`

      const vendor = await this.dbService.vendor.findFirst({
        where: {
          id: updateVendorDocumentDto.vendor_id
        }
      })

      if (vendor.is_active == true) {
        const vendor_document = await this.dbService.vendor_document.update({
          where: {
            id
          },
          data: {
            document_name: file.filename,
            path: url,
            vendor: {
              connect: {
                id: updateVendorDocumentDto.vendor_id
              }
            },
            updated_at: new Date(),
            updated_by: user_id
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

  async remove(id: number, user_id: number) {
    try {


      const vendor_document = await this.dbService.vendor_document.update({
        where: {
          id
        },
        data: {
          deleted_by: user_id,
          deleted_at: new Date()
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
