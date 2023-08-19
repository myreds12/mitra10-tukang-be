import { Test, TestingModule } from '@nestjs/testing';
import { ServiceTypeController } from './service_type.controller';
import { ServiceTypeService } from './service_type.service';

describe('ServiceTypeController', () => {
  let controller: ServiceTypeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServiceTypeController],
      providers: [ServiceTypeService],
    }).compile();

    controller = module.get<ServiceTypeController>(ServiceTypeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
