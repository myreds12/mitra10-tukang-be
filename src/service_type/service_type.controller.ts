import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ServiceTypeService } from './service_type.service';
import { CreateServiceTypeDto } from './dto/create-service_type.dto';
import { UpdateServiceTypeDto } from './dto/update-service_type.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Controller('service-type')
export class ServiceTypeController {
  constructor(private readonly serviceTypeService: ServiceTypeService) {}

  // Public endpoint for vendor registration (no auth required)
  @Get('public/list')
  @HttpCode(HttpStatus.OK)
  findAllPublic() {
    return this.serviceTypeService.findAllPublic();
  }

  @UseGuards(JwtAuthGuard)
  @Post('/')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createServiceTypeDto: CreateServiceTypeDto, @Request() req) {
    const user_id = req.user.id;
    return this.serviceTypeService.create(createServiceTypeDto, user_id);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(@Query() query: QueryParamsDto) {
    return this.serviceTypeService.findAll(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/find/:id')
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id') id: string) {
    return this.serviceTypeService.findOne(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/:id')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id') id: string,
    @Body() updateServiceTypeDto: UpdateServiceTypeDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return this.serviceTypeService.update(+id, updateServiceTypeDto, user_id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('/:id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.serviceTypeService.remove(+id, user_id);
  }
}

@Controller('service-types')
export class PublicServiceTypesController {
  constructor(private readonly serviceTypeService: ServiceTypeService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  findAllPublic() {
    return this.serviceTypeService.findAllPublic();
  }
}
