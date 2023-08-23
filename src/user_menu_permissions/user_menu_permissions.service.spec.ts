import { Test, TestingModule } from '@nestjs/testing';
import { UserMenuPermissionsService } from './user_menu_permissions.service';

describe('UserMenuPermissionsService', () => {
  let service: UserMenuPermissionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserMenuPermissionsService],
    }).compile();

    service = module.get<UserMenuPermissionsService>(UserMenuPermissionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
