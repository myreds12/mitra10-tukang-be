import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ServiceTypeService } from './service_type.service';
import { CreateServiceTypeDto } from './dto/create-service_type.dto';
import { UpdateServiceTypeDto } from './dto/update-service_type.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';


@Controller('service-type')
@UseGuards(JwtAuthGuard)
export class ServiceTypeController {
  constructor(private readonly serviceTypeService: ServiceTypeService) { }

  @Post('/create')
  create(@Body() createServiceTypeDto: CreateServiceTypeDto, @Request() req) {
    const user_id = req.user.id
    return this.serviceTypeService.create(createServiceTypeDto, user_id);
  }

  @Get('/get')
  findAll() {
    return this.serviceTypeService.findAll();
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.serviceTypeService.findOne(+id);
  }

  @Patch('/update/:id')
  update(@Param('id') id: string, @Body() updateServiceTypeDto: UpdateServiceTypeDto, @Request() req) {
    const user_id = req.user.id
    return this.serviceTypeService.update(+id, updateServiceTypeDto, user_id);
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id
    return this.serviceTypeService.remove(+id, user_id);
  }
}
