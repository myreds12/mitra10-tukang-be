import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SettingIncentiveService } from './setting-incentive.service';
import { CreateSettingIncentiveDto } from './dto/create-setting-incentive.dto';
import { UpdateSettingIncentiveDto } from './dto/update-setting-incentive.dto';

@Controller('setting-incentive')
export class SettingIncentiveController {
  constructor(private readonly settingIncentiveService: SettingIncentiveService) {}

  @Post()
  create(@Body() createSettingIncentiveDto: CreateSettingIncentiveDto) {
    return this.settingIncentiveService.create(createSettingIncentiveDto);
  }

  @Get()
  findAll() {
    return this.settingIncentiveService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.settingIncentiveService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSettingIncentiveDto: UpdateSettingIncentiveDto) {
    return this.settingIncentiveService.update(+id, updateSettingIncentiveDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.settingIncentiveService.remove(+id);
  }
}
