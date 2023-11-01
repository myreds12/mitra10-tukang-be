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
} from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) { }

  @Post('/')
  create(@Body() createEmployeeDto: CreateEmployeeDto, @Request() req) {
    const user_id = req.user.id;
    return this.employeeService.create(createEmployeeDto, user_id);
  }

  @Get('/')
  findAll() {
    return this.employeeService.findAll();
  }

  @Get('/:id')
  findOne(@Param('id') id: string) {
    return this.employeeService.findOne(+id);
  }

  @Post('/:id')
  update(
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return this.employeeService.update(+id, updateEmployeeDto, user_id);
  }

  @Delete('/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.employeeService.remove(+id, user_id);
  }
}
