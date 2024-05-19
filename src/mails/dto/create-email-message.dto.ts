import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { MailType } from '../enum/mail_type.enum';

export class CreateEmailMessageDto {
  @ApiProperty()
  @IsEnum(MailType)
  email_type: MailType;

  @IsString()
  @IsNotEmpty()
  title: string;

  @ValidateIf((o) => o.email_type === MailType.CSI)
  @IsNumber()
  csi_id: number;

  greetings: string;

  welcome_header: string;

  cc?: string;
  bcc?: string;

  footer: string;

  is_active?: boolean;

  @Type(() => TermsDetailDto)
  terms_detail: TermsDetailDto[];

  @Type(() => InformationDetailDto)
  information_detail: InformationDetailDto[];
}

class TermsDetailDto {
  @ApiProperty()
  @IsOptional()
  id?: number;

  @IsString()
  term: string;
}

class InformationDetailDto {
  @ApiProperty()
  @IsOptional()
  id?: number;

  @IsString()
  information: string;
}
