import { Test, TestingModule } from '@nestjs/testing';
import { ComplaintEvidenceController } from './complaint-evidence.controller';
import { ComplaintEvidenceService } from './complaint-evidence.service';

describe('ComplaintEvidenceController', () => {
  let controller: ComplaintEvidenceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ComplaintEvidenceController],
      providers: [ComplaintEvidenceService],
    }).compile();

    controller = module.get<ComplaintEvidenceController>(ComplaintEvidenceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
