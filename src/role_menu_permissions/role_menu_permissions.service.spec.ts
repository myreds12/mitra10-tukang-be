import { Test, TestingModule } from '@nestjs/testing';
import { RoleMenuPermissionsService } from './role_menu_permissions.service';

describe('RoleMenuPermissionsService', () => {
  let service: RoleMenuPermissionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoleMenuPermissionsService],
    }).compile();

    service = module.get<RoleMenuPermissionsService>(RoleMenuPermissionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
