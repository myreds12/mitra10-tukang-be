import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Res, HttpStatus, Query } from '@nestjs/common';
import { ComplaintChannelService } from './complaint_channel.service';
import { CreateComplaintChannelDto } from './dto/create-complaint_channel.dto';
import { UpdateComplaintChannelDto } from './dto/update-complaint_channel.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@UseGuards(JwtAuthGuard)
@Controller('complaint-channel')
export class ComplaintChannelController {
  constructor(private readonly complaintChannelService: ComplaintChannelService) { }

  @Post()
  async create(@Body() createComplaintChannelDto: CreateComplaintChannelDto, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id
      const complaint_channel = await this.complaintChannelService.create(createComplaintChannelDto, user_id)
      return response.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Created',
        data: complaint_channel
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error Whhle Created',
        stack: error
      })
    }
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto, @Res() response) {
    try {
      const complaint_channel = await this.complaintChannelService.findAll(query)
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Get',
        data: complaint_channel
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error
      })
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() response) {
    try {
      const complaint_channel = await this.complaintChannelService.findOne(+id)
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Find',
        data: complaint_channel
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Find',
        stack: error
      })
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateComplaintChannelDto: UpdateComplaintChannelDto, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id
      const complaint_channel = await this.complaintChannelService.update(+id, updateComplaintChannelDto, user_id)
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Updated',
        data: complaint_channel
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error Whhle Update',
        stack: error
      })
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id
      const complaint_channel = await this.complaintChannelService.remove(+id, user_id)
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Delete',
        data: complaint_channel
      })
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Delete',
        stack: error
      })
    }
  }
}
