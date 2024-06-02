import { Test, TestingModule } from '@nestjs/testing';
import { SettingIncentiveService } from './setting-incentive.service';

describe('SettingIncentiveService', () => {
  let service: SettingIncentiveService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingIncentiveService],
    }).compile();

    service = module.get<SettingIncentiveService>(SettingIncentiveService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
