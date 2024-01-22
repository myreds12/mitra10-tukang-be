import { Test, TestingModule } from '@nestjs/testing';
import { CsiController } from './csi.controller';
import { CsiService } from './csi.service';

describe('CsiController', () => {
  let controller: CsiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CsiController],
      providers: [CsiService],
    }).compile();

    controller = module.get<CsiController>(CsiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
