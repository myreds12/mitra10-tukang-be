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
  Res,
} from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post('/')
  async create(@Body() createEmployeeDto: CreateEmployeeDto, @Request() req) {
    const user_id = req.user.id;
    return await this.employeeService.create(createEmployeeDto, user_id);
  }

  @Get('/')
  async findAll(@Query() queryParamsDto: QueryParamsDto, @Res() response) {
    return await this.employeeService.findAll(queryParamsDto);
  }

  @Get('/:id')
  async findOne(@Param('id') id: string) {
    return await this.employeeService.findOne(+id);
  }

  @Post('/:id')
  async update(
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return await this.employeeService.update(+id, updateEmployeeDto, user_id);
  }

  @Delete('/:id')
  async remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return await this.employeeService.remove(+id, user_id);
  }
}
