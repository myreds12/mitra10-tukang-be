/* eslint-disable prettier/prettier */
import { PartialType } from '@nestjs/swagger';
import { CreateComissionSalesIncentiveDto } from './create-comission_sales_incentive.dto';

export class UpdateComissionSalesIncentiveDto extends PartialType(CreateComissionSalesIncentiveDto) {}
