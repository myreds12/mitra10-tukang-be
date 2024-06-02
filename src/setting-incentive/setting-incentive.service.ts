import { Injectable } from '@nestjs/common';
import { CreateSettingIncentiveDto } from './dto/create-setting-incentive.dto';
import { UpdateSettingIncentiveDto } from './dto/update-setting-incentive.dto';

@Injectable()
export class SettingIncentiveService {
  create(createSettingIncentiveDto: CreateSettingIncentiveDto) {
    return 'This action adds a new settingIncentive';
  }

  findAll() {
    return `This action returns all settingIncentive`;
  }

  findOne(id: number) {
    return `This action returns a #${id} settingIncentive`;
  }

  update(id: number, updateSettingIncentiveDto: UpdateSettingIncentiveDto) {
    return `This action updates a #${id} settingIncentive`;
  }

  remove(id: number) {
    return `This action removes a #${id} settingIncentive`;
  }
}
