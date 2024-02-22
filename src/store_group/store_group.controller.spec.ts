import { Test, TestingModule } from '@nestjs/testing';
import { StoreGroupController } from './store_group.controller';
import { StoreGroupService } from './store_group.service';

describe('StoreGroupController', () => {
  let controller: StoreGroupController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StoreGroupController],
      providers: [StoreGroupService],
    }).compile();

    controller = module.get<StoreGroupController>(StoreGroupController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
