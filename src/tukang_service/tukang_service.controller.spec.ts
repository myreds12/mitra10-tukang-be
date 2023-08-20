import { Test, TestingModule } from '@nestjs/testing';
import { TukangServiceController } from './tukang_service.controller';
import { TukangServiceService } from './tukang_service.service';

describe('TukangServiceController', () => {
  let controller: TukangServiceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TukangServiceController],
      providers: [TukangServiceService],
    }).compile();

    controller = module.get<TukangServiceController>(TukangServiceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
