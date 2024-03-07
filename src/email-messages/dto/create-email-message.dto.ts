import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString } from "class-validator";

export class CreateEmailMessageDto {
  @ApiProperty()
  email_type: string;

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
