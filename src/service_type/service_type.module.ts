import { Module } from '@nestjs/common';
import { ServiceTypeService } from './service_type.service';
import { PublicServiceTypesController, ServiceTypeController } from './service_type.controller';

@Module({
  controllers: [ServiceTypeController, PublicServiceTypesController],
  providers: [ServiceTypeService],
})
export class ServiceTypeModule {}
