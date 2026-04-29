import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

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

      return banks;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const { take, page, search } = query;
      const skip = page * take - take;
      const where = {
        bank_name: {
          contains: search ? search : undefined,
        },
        deleted_at: null,
      };
      const banks = await this.dbService.bank.findMany({
        skip,
        take: take <= 0 ? undefined : take,
        where,
        orderBy: {
          bank_name: 'asc'
        }
      });

      const total = await this.dbService.bank.count({
        where,
      });

      return {
        data: banks,
        meta: {
          total,
          page,
          take,
        },
      };
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const bank = await this.dbService.bank.findFirst({
        where: {
          id,
        },
      });

      return bank;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async update(id: number, updateBankDto: UpdateBankDto, user_id: number) {
    try {
      const bank = await this.dbService.bank.update({
        where: {
          id,
        },
        data: {
          ...updateBankDto,
          updated_at: new Date(),
          updated_by: user_id,
        },
      });

      return bank;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async remove(id: number, user_id: number) {
    try {
      const bank = await this.dbService.bank.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
          is_active: false,
          deleted_by: user_id,
        },
      });

      return bank;
    } catch (error) {
      console.error(error);

      throw error;
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
