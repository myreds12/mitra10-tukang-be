import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import { ComplaintChannelsService } from './complaint_channels.service';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Controller('complaint-channels')
export class ComplaintChannelsController {
  constructor(
    private readonly complaintChannelsService: ComplaintChannelsService,
  ) {}
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
