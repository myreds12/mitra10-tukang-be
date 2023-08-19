import { Test, TestingModule } from '@nestjs/testing';
import { TukangService } from './tukang.service';

describe('TukangService', () => {
  let service: TukangService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TukangService],
    }).compile();

    service = module.get<TukangService>(TukangService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
