import { Injectable } from '@nestjs/common';
import { CreateEmailMessageDto } from './dto/create-email-message.dto';
import { UpdateEmailMessageDto } from './dto/update-email-message.dto';

@Injectable()
export class EmailMessagesService {
  create(createEmailMessageDto: CreateEmailMessageDto) {
    return 'This action adds a new emailMessage';
  }

  findAll() {
    return `This action returns all emailMessages`;
  }

  findOne(id: number) {
    return `This action returns a #${id} emailMessage`;
  }

  update(id: number, updateEmailMessageDto: UpdateEmailMessageDto) {
    return `This action updates a #${id} emailMessage`;
  }

  remove(id: number) {
    return `This action removes a #${id} emailMessage`;
  }
}
