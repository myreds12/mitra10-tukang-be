import { PartialType } from '@nestjs/swagger';
import { CreateComplaintChannelDto } from './create-complaint_channel.dto';

export class UpdateComplaintChannelDto extends PartialType(CreateComplaintChannelDto) {}
