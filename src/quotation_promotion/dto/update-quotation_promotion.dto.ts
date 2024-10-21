import { PartialType } from '@nestjs/swagger';
import { CreateQuotationPromotionDto } from './create-quotation_promotion.dto';

export class UpdateQuotationPromotionDto extends PartialType(CreateQuotationPromotionDto) {}
