import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  HttpCode,
  Query,
} from '@nestjs/common';
import { IncentiveService } from './incentive.service';
import { CreateIncentiveDto } from './dto/create-incentive.dto';
import { UpdatedIncentiveDto } from './dto/update-incentive.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Controller('incentive')
export class IncentiveController {
  constructor(private readonly incentiveService: IncentiveService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createIncentiveDto: CreateIncentiveDto) {
    return await this.incentiveService.create(createIncentiveDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() query: QueryParamsDto) {
    try {
      const { data, meta } = await this.incentiveService.findAll(query);

      return {
        data: data.map((incentive) => ({
          ...incentive,
          stores: incentive.stores.map((store) => store.store_id),
        })),
        meta,
      };
    } catch (error) {
      throw error;
    }
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    const data = await this.incentiveService.findOne(+id);
    return {
      ...data,
      stores: data.stores.map((store) => store.store_id),
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() updateIncentiveDto: UpdatedIncentiveDto,
  ) {
    try {
      return await this.incentiveService.update(+id, updateIncentiveDto);
    } catch (error) {
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.incentiveService.remove(+id);
  }
}
