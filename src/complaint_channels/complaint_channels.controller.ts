import { Body, Controller, Get, HttpStatus, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ComplaintChannelsService } from './complaint_channels.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { ComplaintChannelDto } from './dto/complaint_channel.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('complaint-channels')
export class ComplaintChannelsController {
  constructor(
    private readonly complaintChannelsService: ComplaintChannelsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: ComplaintChannelDto, @Req() req, @Res() res){
    try{
      const user_id = req.user.id
      const complaintChannel = await this.complaintChannelsService.create(dto, user_id)

      return res.status(201).json({
        status: HttpStatus.CREATED,
        message: 'SuccessFully Created',
        data: complaintChannel
      })
    }catch(err){
      return res.status(400).json({
        status: HttpStatus.CREATED,
        message: err.message ?? 'SuccessFully Created',
        stack: err
      })
    }
  }
  @Get('/')
  async findAll(@Query() query: QueryParamsDto, @Res() response) {
    const findAll = await this.complaintChannelsService.findAll(query);
    return response.status(200).json({
      status: HttpStatus.OK,
      message: 'Get Channels',
      data: findAll,
    });
  }
}
