import { Test, TestingModule } from '@nestjs/testing';
import { RemedialsService } from './remedials.service';

describe('RemedialsService', () => {
  let service: RemedialsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RemedialsService],
    }).compile();

    service = module.get<RemedialsService>(RemedialsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
