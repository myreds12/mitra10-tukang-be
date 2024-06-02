import { Test, TestingModule } from '@nestjs/testing';
import { SettingIncentiveController } from './setting-incentive.controller';
import { SettingIncentiveService } from './setting-incentive.service';

describe('SettingIncentiveController', () => {
  let controller: SettingIncentiveController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingIncentiveController],
      providers: [SettingIncentiveService],
    }).compile();

    controller = module.get<SettingIncentiveController>(SettingIncentiveController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
