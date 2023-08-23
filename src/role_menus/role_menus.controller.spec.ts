import { Test, TestingModule } from '@nestjs/testing';
import { RoleMenusController } from './role_menus.controller';
import { RoleMenusService } from './role_menus.service';

describe('RoleMenusController', () => {
  let controller: RoleMenusController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoleMenusController],
      providers: [RoleMenusService],
    }).compile();

    controller = module.get<RoleMenusController>(RoleMenusController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
