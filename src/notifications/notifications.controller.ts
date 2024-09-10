import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { users } from '@prisma/client';

interface UserRequest extends IExpressRequest {
  user: users;
}
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) { }
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: QueryParamsDto, @Req() req: UserRequest,
  ) {
    return this.notificationsService.findAll(query, req.user);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  update(@Body() dto: UpdateNotificationDto[], @Req() req: UserRequest) {
    return this.notificationsService.update(dto, req.user)
  }
}
