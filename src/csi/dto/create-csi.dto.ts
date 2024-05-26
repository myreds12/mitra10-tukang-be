import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class CreateCsiDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsNotEmpty()
  active: boolean;

  @IsString()
  @IsNotEmpty()
  survey_link: string;

  @IsString()
  @IsNotEmpty()
  spreadsheets_link: string;
}
