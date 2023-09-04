import { Test, TestingModule } from '@nestjs/testing';
import { UserMenuPermissionController } from './user_menu_permission.controller';
import { UserMenuPermissionService } from './user_menu_permission.service';

describe('UserMenuPermissionController', () => {
  let controller: UserMenuPermissionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserMenuPermissionController],
      providers: [UserMenuPermissionService],
    }).compile();

    controller = module.get<UserMenuPermissionController>(UserMenuPermissionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
