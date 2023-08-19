import { Test, TestingModule } from '@nestjs/testing';
import { TukangController } from './tukang.controller';
import { TukangService } from './tukang.service';

describe('TukangController', () => {
  let controller: TukangController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TukangController],
      providers: [TukangService],
    }).compile();

    controller = module.get<TukangController>(TukangController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
