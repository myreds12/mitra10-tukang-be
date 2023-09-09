import { Module } from '@nestjs/common';
import { ServiceTypeService } from './service_type.service';
import { ServiceTypeController } from './service_type.controller';

@Module({
  controllers: [ServiceTypeController],
  providers: [ServiceTypeService],
})
export class ServiceTypeModule {}
