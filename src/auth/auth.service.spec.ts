import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

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
