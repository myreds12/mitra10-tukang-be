import { Test, TestingModule } from '@nestjs/testing';
import { UserMenuPermissionService } from './user_menu_permission.service';

describe('UserMenuPermissionService', () => {
  let service: UserMenuPermissionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserMenuPermissionService],
    }).compile();

    service = module.get<UserMenuPermissionService>(UserMenuPermissionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
