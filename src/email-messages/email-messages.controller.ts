import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Res, HttpStatus } from '@nestjs/common';
import { EmailMessagesService } from './email-messages.service';
import { CreateEmailMessageDto } from './dto/create-email-message.dto';
import { UpdateEmailMessageDto } from './dto/update-email-message.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import {Request, Response} from 'express';
import { users } from '@prisma/client';
interface UserRequest extends Request {
  user: users;

}

@UseGuards(JwtAuthGuard)
@Controller('email-messages')
export class EmailMessagesController {
  constructor(private readonly emailMessagesService: EmailMessagesService) {}

  @Post()
  async create(@Body() createEmailMessageDto: CreateEmailMessageDto, @Req() req : UserRequest, @Res() res : Response){
    try{
      const user = req.user;
      const emailMessage = await this.emailMessagesService.create(createEmailMessageDto, user.id);

      return res.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Successfully Create',
        data: emailMessage
      });
    }catch(error){
      console.log(error);
      
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Error While Create',
        stack: error
      });
    }
  }

  @Get()
  async findAll(@Res() res : Response) {
    try{
      const emailMessages = await this.emailMessagesService.findAll();
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Successfully',
        data: emailMessages
      })
    }catch(error){
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Error',
        stack: error
      });    
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: Response) {
    try{
      const emailMessage = await this.emailMessagesService.findOne(+id);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Successfully',
        data: emailMessage
      })
    }catch(error){
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Error',
        stack: error
      });    
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateEmailMessageDto: UpdateEmailMessageDto, @Req() req: UserRequest, @Res() res: Response){
    try{
      const user = req.user;
      const emailMessage = await this.emailMessagesService.update(+id, updateEmailMessageDto, user.id);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Successfully',
        data: emailMessage
      })
    }catch(error){
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Error',
        stack: error
      });    
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: UserRequest, @Res()res: Response) {
    try{
      const user = req.user;
      const emailMessage = await this.emailMessagesService.remove(+id, user.id);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Successfully',
        data: emailMessage
      })
    }catch(error){
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Error',
        stack: error
      });    
    }
  }
}
