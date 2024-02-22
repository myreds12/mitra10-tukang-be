import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { CreateStoreGroupDto } from './dto/create-store_group.dto';
import { UpdateStoreGroupDto } from './dto/update-store_group.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class StoreGroupService {
  constructor( private readonly dbService: PrismaService){}
  create(createStoreGroupDto: CreateStoreGroupDto) {
    return 'This action adds a new storeGroup';
  }

  async findAll() {
   const storeGroup = await this.dbService.store_group.findMany();

   return {
    status: HttpStatus.OK,
    message: 'Succesfully find store',
    data: storeGroup,
  };
  }

  async storeByGroup(id: number){
    const storeByGroup = await this.dbService.store_group.findFirst({
      where: {
        id
      }
    });
    if(!storeByGroup) throw new NotFoundException('Store Group Not Found!');

    const store = await this.dbService.store.findMany({
      where: {
        store_group_id: storeByGroup.id
      },
      include: {
        city: true,
        store_group: true
      }
    });

    return {
      status: HttpStatus.OK,
      message: 'Succesfully find store',
      data: store,
    };
  }

  async createStoreGroup(group_name: string, user_id: number){
    const storeGroup = await this.dbService.store_group.create({
      data: {
        group_name: group_name,
        created_by: user_id
      }
    });

     return {
      status: HttpStatus.CREATED,
      message: 'Succesfully create store',
      data: storeGroup,
    };
  }

  update(id: number, updateStoreGroupDto: UpdateStoreGroupDto) {
    return `This action updates a #${id} storeGroup`;
  }

  remove(id: number) {
    return `This action removes a #${id} storeGroup`;
  }
}
