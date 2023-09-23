import { Test, TestingModule } from '@nestjs/testing';
import { UserMenuPermissionsController } from './user_menu_permissions.controller';
import { UserMenuPermissionsService } from './user_menu_permissions.service';

describe('UserMenuPermissionsController', () => {
  let controller: UserMenuPermissionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserMenuPermissionsController],
      providers: [UserMenuPermissionsService],
    }).compile();

    controller = module.get<UserMenuPermissionsController>(UserMenuPermissionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
