/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import {  DataMasterService } from './dataMaster.service';
import { DataMasterController } from './dataMaster.controller';

@Module({
  controllers: [DataMasterController],
  providers: [DataMasterService]
})
export class DataMasterModule {}
