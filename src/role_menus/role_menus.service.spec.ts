import { Test, TestingModule } from '@nestjs/testing';
import { RoleMenusService } from './role_menus.service';

describe('RoleMenusService', () => {
  let service: RoleMenusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoleMenusService],
    }).compile();

    service = module.get<RoleMenusService>(RoleMenusService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
