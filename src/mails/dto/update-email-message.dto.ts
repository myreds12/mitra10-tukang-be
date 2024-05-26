import { PartialType } from '@nestjs/swagger';
import { CreateEmailMessageDto } from './create-email-message.dto';

export class UpdateEmailMessageDto extends PartialType(CreateEmailMessageDto) {}
