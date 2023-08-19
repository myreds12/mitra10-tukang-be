import { Injectable } from '@nestjs/common';
import { CreateServiceTypeDto } from './dto/create-service_type.dto';
import { UpdateServiceTypeDto } from './dto/update-service_type.dto';

@Injectable()
export class ServiceTypeService {
  create(createServiceTypeDto: CreateServiceTypeDto) {
    return 'This action adds a new serviceType';
  }

  findAll() {
    return `This action returns all serviceType`;
  }

  findOne(id: number) {
    return `This action returns a #${id} serviceType`;
  }

  update(id: number, updateServiceTypeDto: UpdateServiceTypeDto) {
    return `This action updates a #${id} serviceType`;
  }

  remove(id: number) {
    return `This action removes a #${id} serviceType`;
  }
}
