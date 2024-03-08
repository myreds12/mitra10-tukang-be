import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Injectable()
export class BankService {
  constructor(private readonly dbService: PrismaService) {}
  async create(createBankDto: CreateBankDto, user_id: number) {
    try {
      const banks = await this.dbService.bank.create({
        data: {
          bank_name: createBankDto.bank_name,
          created_by: user_id,
        },
      });

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully Create Data',
        data: banks
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Create Data',
      };
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const { take, page, search } = query;
      const skip = page * take - take;
      const banks = await this.dbService.bank.findMany({
        skip,
        take: take <= 0 ? undefined : take,
        where: {
          bank_name: {
            contains: search ? search : undefined,
          },
          deleted_at: null
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: banks,
        total: banks.length,
        page,
        take,
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
      const banks = await this.dbService.bank.findFirst({
        where: {
          id,
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: banks,
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data',
      };
    }
  }

  async update(id: number, updateBankDto: UpdateBankDto, user_id: number) {
    try {
      const banks = await this.dbService.bank.update({
        where: {
          id,
        },
        data: {
          ...updateBankDto,
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
      const banks = await this.dbService.bank.update({
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

  
  async getCode() {
    const bank = await this.dbService.bank.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    return bank[0] || null;
  }
}
