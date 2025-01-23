/* eslint-disable prettier/prettier */
import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { CreateDataMasterDto } from './dto/create-data-master.dto';
import { UpdateDataMasterkDto } from './dto/update-data-master.dto';

@Injectable()
export class DataMasterService {
  constructor(private readonly dbService: PrismaService) {}

  async findAll(query: QueryParamsDto) {
    const { take, page, search } = query;
    const skip = page * take - take;
    const where = {
      name: {
        contains: search ? search : undefined,
      },
    };
    const city = await this.dbService.data_master.findMany({
      
      skip,
      take: take <= 0 ? undefined : take,
      where
    });
    
    return { data: city, meta: { countTotal: city.length, take, page } };
  }
   async create(createBankDto: CreateDataMasterDto, user_id: number) {
      try {
        const banks = await this.dbService.data_master.create({
          data: {
            name: createBankDto.name,
            value: Number(createBankDto.value),
            created_by: user_id,
          },
        });
  
        return banks;
      } catch (error) {
        console.error(error);
  
        throw error;
      }
    }

      async findOne(id: number) {
        try {
          const bank = await this.dbService.data_master.findFirst({
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
    
      async update(id: number, updateBankDto: UpdateDataMasterkDto, user_id: number) {
        try {
          const bank = await this.dbService.data_master.update({
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
    
      async remove(id: number) {
        try {
          const bank = await this.dbService.data_master.delete({
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
}
