import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateEmailMessageDto {
  @ApiProperty()
  email_type: string;

  greetings: string;

  information: string;

  terms: string;
  @Type(() => TermsDetailDto)
  terms_detail: TermsDetailDto[];

}


class TermsDetailDto{
  @ApiProperty()
  term: string;
}

class InformationDetailDto{
  @ApiProperty()
  information: string;
}
