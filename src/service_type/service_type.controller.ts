import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ServiceTypeService } from './service_type.service';
import { CreateServiceTypeDto } from './dto/create-service_type.dto';
import { UpdateServiceTypeDto } from './dto/update-service_type.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Controller('service-type')
@UseGuards(JwtAuthGuard)
export class ServiceTypeController {
  constructor(private readonly serviceTypeService: ServiceTypeService) {}

  @Post('/')
  create(@Body() createServiceTypeDto: CreateServiceTypeDto, @Request() req) {
    const user_id = req.user.id;
    return this.serviceTypeService.create(createServiceTypeDto, user_id);
  }

  @Get()
  findAll(@Query() query: QueryParamsDto) {
    return this.serviceTypeService.findAll(query);
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.serviceTypeService.findOne(+id);
  }

  @Post('/:id')
  update(
    @Param('id') id: string,
    @Body() updateServiceTypeDto: UpdateServiceTypeDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return this.serviceTypeService.update(+id, updateServiceTypeDto, user_id);
  }

  @Delete('/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.serviceTypeService.remove(+id, user_id);
  }
}
