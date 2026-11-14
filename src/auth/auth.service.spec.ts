import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { hashSync } from 'bcrypt';

describe('AuthService.updateUserStatus', () => {
  function createService() {
    const dbService = {
      users: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    } as any;
    const jwtService = {} as any;

    return {service: new AuthService(dbService, jwtService), dbService};
  }

  it('updates the active flag for an authorized administrator', async () => {
    const {service, dbService} = createService();
    dbService.users.findFirst
      .mockResolvedValueOnce({id: 10, roles: {name: 'Super User'}})
      .mockResolvedValueOnce({id: 20, deleted_at: null});
    dbService.users.update.mockResolvedValue({
      id: 20,
      username: 'test-user',
      password: 'secret',
      is_active: false,
    });

    const result = await service.updateUserStatus(20, false, 10);

    expect(dbService.users.update).toHaveBeenCalledWith({
      where: {id: 20},
      data: {is_active: false},
    });
    expect(result).toEqual({id: 20, username: 'test-user', is_active: false});
  });

  it('rejects non-administrators', async () => {
    const {service, dbService} = createService();
    dbService.users.findFirst.mockResolvedValue({id: 10, roles: {name: 'Store CS'}});

    await expect(service.updateUserStatus(20, false, 10)).rejects.toThrow(ForbiddenException);
    expect(dbService.users.update).not.toHaveBeenCalled();
  });

  it('does not allow an administrator to deactivate their own account', async () => {
    const {service, dbService} = createService();
    dbService.users.findFirst.mockResolvedValueOnce({id: 10, roles: {name: 'Super User'}});

    await expect(service.updateUserStatus(10, false, 10)).rejects.toThrow(BadRequestException);
    expect(dbService.users.update).not.toHaveBeenCalled();
  });
});

describe('AuthService.login', () => {
  function createLoginService() {
    const dbService = {
      users: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      vendor_registration: {
        findFirst: jest.fn(),
      },
      vendor_registration_token: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      roles: {
        findFirst: jest.fn().mockResolvedValue({name: 'Admin HO'}),
      },
      store: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      vendor: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;
    const jwtService = {
      sign: jest.fn().mockReturnValue('token'),
    } as any;

    return {service: new AuthService(dbService, jwtService), dbService};
  }

  const createUser = (id: number, password: string, isActive: boolean) => ({
    id,
    username: 'duplicate-user',
    role_id: 1,
    password: hashSync(password, 4),
    is_active: isActive,
    deleted_at: null,
    roles: {id: 1, name: 'Admin HO'},
    tukang: [],
    store: [],
    employee: null,
    sales: [],
    manager: [],
    pic_vendor: [],
  });

  it('selects the duplicate record whose password matches', async () => {
    const {service, dbService} = createLoginService();
    const inactiveUser = createUser(20, 'inactive-password', false);
    const activeUser = createUser(10, 'active-password', true);
    dbService.users.findMany.mockResolvedValue([inactiveUser, activeUser]);

    const result = await service.login({
      username: 'duplicate-user',
      password: 'active-password',
    });

    expect(result.user.id).toBe(activeUser.id);
    expect(result.accessToken).toBe('token');
  });
});

describe('AuthService password target selection', () => {
  it('rejects password operations when username is duplicated', async () => {
    const dbService = {
      users: {
        findMany: jest.fn().mockResolvedValue([
          {id: 20, username: 'duplicate-user'},
          {id: 10, username: 'duplicate-user'},
        ]),
      },
    } as any;
    const service = new AuthService(dbService, {} as any);

    await expect(
      service.resetPassword('duplicate-user'),
    ).rejects.toThrow('Username memiliki lebih dari satu akun');
  });
});
