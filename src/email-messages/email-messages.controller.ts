import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { EmailMessagesService } from './email-messages.service';
import { CreateEmailMessageDto } from './dto/create-email-message.dto';
import { UpdateEmailMessageDto } from './dto/update-email-message.dto';

@Controller('email-messages')
export class EmailMessagesController {
  constructor(private readonly emailMessagesService: EmailMessagesService) {}

  @Post()
  create(@Body() createEmailMessageDto: CreateEmailMessageDto) {
    return this.emailMessagesService.create(createEmailMessageDto);
  }

  @Get()
  findAll() {
    return this.emailMessagesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.emailMessagesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateEmailMessageDto: UpdateEmailMessageDto) {
    return this.emailMessagesService.update(+id, updateEmailMessageDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.emailMessagesService.remove(+id);
  }
}
