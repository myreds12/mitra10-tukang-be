import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { EmailMessageType } from "../enum/email-message.enum";

export class CreateEmailMessageDto {
  @ApiProperty()
  @IsEnum(EmailMessageType)
  email_type: EmailMessageType;

  greetings: string;

  welcome_header: string;

  footer: string;
  
  @Type(() => TermsDetailDto)
  terms_detail: TermsDetailDto[];
  @Type(() => InformationDetailDto)
  information_detail: InformationDetailDto[];

}


class TermsDetailDto{
  @ApiProperty()
  @IsOptional()
  id?:number;
  
  @IsString()
  term: string;
}

class InformationDetailDto{
  @ApiProperty()
  @IsOptional()
  id?:number;

  @IsString()
  information: string;
}
