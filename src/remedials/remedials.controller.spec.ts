import { Test, TestingModule } from '@nestjs/testing';
import { RemedialsController } from './remedials.controller';
import { RemedialsService } from './remedials.service';

describe('RemedialsController', () => {
  let controller: RemedialsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RemedialsController],
      providers: [RemedialsService],
    }).compile();

    controller = module.get<RemedialsController>(RemedialsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
