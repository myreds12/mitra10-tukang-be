import { Test, TestingModule } from '@nestjs/testing';
import { ComplaintEvidenceService } from './complaint-evidence.service';

describe('ComplaintEvidenceService', () => {
  let service: ComplaintEvidenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComplaintEvidenceService],
    }).compile();

    service = module.get<ComplaintEvidenceService>(ComplaintEvidenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
