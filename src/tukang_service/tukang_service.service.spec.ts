import { Test, TestingModule } from '@nestjs/testing';
import { TukangServiceService } from './tukang_service.service';

describe('TukangServiceService', () => {
  let service: TukangServiceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TukangServiceService],
    }).compile();

    service = module.get<TukangServiceService>(TukangServiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
