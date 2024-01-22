import { Test, TestingModule } from '@nestjs/testing';
import { CsiService } from './csi.service';

describe('CsiService', () => {
  let service: CsiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CsiService],
    }).compile();

    service = module.get<CsiService>(CsiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
