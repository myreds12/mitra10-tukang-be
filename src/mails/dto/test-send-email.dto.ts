import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class TestSendEmailDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Alamat email tujuan untuk testing pengiriman template index.pug via SMTP',
  })
  @IsNotEmpty({ message: 'Email tidak boleh kosong' })
  @IsEmail({}, { message: 'Format email tidak valid' })
  email: string;
}
