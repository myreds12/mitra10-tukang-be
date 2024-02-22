import { Test, TestingModule } from '@nestjs/testing';
import { StoreGroupService } from './store_group.service';

describe('StoreGroupService', () => {
  let service: StoreGroupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StoreGroupService],
    }).compile();

    service = module.get<StoreGroupService>(StoreGroupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
