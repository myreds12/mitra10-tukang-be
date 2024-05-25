import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ComplaintChannelsService } from './complaint_channels.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { ComplaintChannelDto } from './dto/complaint_channel.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';

@Controller('complaint-channels')
export class ComplaintChannelsController {
  constructor(
    private readonly complaintChannelsService: ComplaintChannelsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: ComplaintChannelDto, @Req() req: RequestWithUser) {
    try {
      const user_id = req.user.id;
      const complaintChannel = await this.complaintChannelsService.create(
        dto,
        user_id,
      );

      return complaintChannel;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
  @Get('/')
  async findAll(@Query() query: QueryParamsDto) {
    const findAll = await this.complaintChannelsService.findAll(query);
    return findAll;
  }
}
