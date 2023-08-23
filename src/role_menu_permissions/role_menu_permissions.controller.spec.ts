import { Test, TestingModule } from '@nestjs/testing';
import { RoleMenuPermissionsController } from './role_menu_permissions.controller';
import { RoleMenuPermissionsService } from './role_menu_permissions.service';

describe('RoleMenuPermissionsController', () => {
  let controller: RoleMenuPermissionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoleMenuPermissionsController],
      providers: [RoleMenuPermissionsService],
    }).compile();

    controller = module.get<RoleMenuPermissionsController>(RoleMenuPermissionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
