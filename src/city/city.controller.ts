import { Controller, Get, UseGuards, Query, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CityService } from './city.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@UseGuards(JwtAuthGuard)
@Controller('city')
export class CityController {
  constructor(private readonly cityService: CityService) {}

  @Get()
  async findAll(@Query() query: QueryParamsDto) {
    try {
      const data = await this.cityService.findAll(query);
      return data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
