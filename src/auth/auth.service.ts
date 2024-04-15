import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateLoginDto } from './dto/login.dto';
import { CreateRegisterDto } from './dto/register.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { compare, hash } from 'bcrypt';
import { JwtConfig } from 'src/jwt.config';
import { omit } from 'lodash';
import { JwtService } from '@nestjs/jwt';
import { Prisma, users } from '@prisma/client';
import { PermissionAction } from 'src/casl/enum/permission-action.enum';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
// import { PermissionAction } from '../casl/factory/casl-ability.factory';

@Injectable()
export class AuthService {
  constructor(
    private readonly dbService: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: CreateRegisterDto, role_id?: number | null) {
    const user = await this.dbService.users.findFirst({
      where: {
        username: dto.username,
      },
    });
    if (user) {
      throw new HttpException('User Exists', HttpStatus.BAD_REQUEST);
    }

    const [createUser] = await this.dbService.$transaction([
      this.dbService.users.create({
        data: { ...dto, role_id: role_id ?? 2 },
      }),
    ]);

    if (createUser) {
      return {
        statusCode: 200,
        message: 'Register success',
        data: createUser,
      };
    }
    throw new HttpException('Bad request', HttpStatus.BAD_REQUEST);
  }

  async updateUser(id: number, dto: CreateRegisterDto) {
    const user = await this.dbService.users.findFirst({
      where: {
        id,
      },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const update = await this.dbService.users.update({
      where: {
        id,
      },
      data: {
        username: dto.username,
        password: await hash(dto.password, 12),
      },
    });
    return update;
  }

  async deleteUser(id: number) {
    const user = await this.dbService.users.findFirst({
      where: {
        id,
      },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const deleteUser = await this.dbService.users.delete({
      where: {
        id,
      },
    });
    return deleteUser;
  }

  async login(dto: CreateLoginDto) {
    const user = await this.dbService.users.findFirst({
      where: {
        username: {
          equals: dto.username,
        },
      },
      include: {
        tukang: true,
        roles: {
          select: { name: true },
        },
        employee: {
          select: {
            user_id: true,
            full_name: true,
            email: true,
            gender: true,
            phone_number: true,
            nik: true,
            whatsapp_number: true,
            store: {
              select: {
                id: true,
                store_name: true,
              },
            },
          },
        },
        sales: {
          select: {
            id: true,
            user_id: true,
            full_name: true,
            store: {
              select: {
                id: true,
                store_name: true,
              },
            },
          },
        },
        vendor: true,
      },
    });
    console.log(user, dto.username);

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const checkPassword = await compare(dto.password, user.password);
    if (!checkPassword) {
      throw new HttpException('Credential Incorrect', HttpStatus.UNAUTHORIZED);
    }
    return await this.generateJwt(
      user,
      JwtConfig.user_secret,
      JwtConfig.user_expired,
    );
  }

  async getUser(where: Prisma.usersWhereInput, include?: Prisma.usersInclude) {
    return this.dbService.users.findFirst({
      where,
      include: {
        ...include,
        roles: {
          select: {
            name: true,
            role_permissions: {
              select: {
                role_id: true,
                permissions: {
                  include: {
                    menus: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async updatePassword(username: string, dto: ResetPasswordDto) {
    const user = await this.dbService.users.findFirst({
      where: {
        username,
      },
    });
    if (!user) throw new NotFoundException('User Not Found!');
    if (
      user.forget_password &&
      new Date(user.forget_password) <
        new Date(new Date().getTime() - 2 * 60 * 60 * 1000)
    ) {
      await this.dbService.users.update({
        where: {
          id: user.id,
        },
        data: {
          forget_password: null,
        },
      });
      throw new Error('Forget password link has expired');
    }

    const updatePassword = await this.dbService.users.update({
      where: {
        id: user.id,
      },
      data: {
        password: await hash(dto.password, 14),
        forget_password: null,
      },
    });

    return updatePassword;
  }

  async generateJwt(
    user: users,
    secret: any,
    expired = JwtConfig.user_expired,
  ) {
    const { id, username, role_id } = user;

    const accessToken = this.jwtService.sign(
      {
        id: id,
        username,
        role_id,
      },
      {
        expiresIn: expired,
        secret,
      },
    );
    const role = '';
    const permission = '';

    return {
      statusCode: 200,
      accessToken: accessToken,
      user: omit(user, ['password', 'created_at', 'updated_at', 'deleted_at']),
      // menu: menus,
      role,
      permission,
    };
  }

  async getUserPermission(user: users) {
    const userData = await this.getUser({ id: user.id });

    // const userData = await this.dbService.users.findFirst({
    //   where: {
    //     id: user.id,
    //   },
    //   include: {
    //     roles: {
    //       select: {
    //         name: true,
    //         role_permissions: {
    //           select: {
    //             role_id: true,
    //             permissions: {
    //               include: {
    //                 menus: true,
    //               },
    //             },
    //           },
    //         },
    //       },
    //     },
    //   },
    // });

    const permissions = userData.roles.role_permissions.map((x) => ({
      ...x.permissions,
      name: PermissionAction[x.permissions.name.toUpperCase()],
    }));

    return permissions;
  }

  async resetPassword(username: string) {
    const user = await this.dbService.users.findFirst({
      where: {
        username: username,
      },
    });

    if (!user) throw new NotFoundException('User Not Found!!');
    console.log(new Date());

    const userUpdate = await this.dbService.users.update({
      where: {
        id: user.id,
      },
      data: {
        forget_password: new Date(),
      },
    });

    return userUpdate;
  }

  async findAll(query: QueryParamsDto) {
    const { page, take, search } = query;
    const skip = page * take - take;

    const user = await this.dbService.users.findMany({
      where: {
        deleted_at: null,
      },
      skip,
      take: take > 0 ? take : undefined,
      include: {
        employee: true,
        roles: true,
        sales: true,
        tukang: true,
        vendor: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return user;
  }

  async findOne(id: number) {
    const user = await this.dbService.users.findFirst({
      where: {
        id,
      },
    });

    if (!user) throw new NotFoundException('User Not Found!!');

    return user;
  }

  async getUsers(username: string) {
    const user = await this.dbService.users.findFirst({
      where: {
        username: username,
      },
    });

    if (!user) throw new NotFoundException('User Not Found!!');

    return user;
  }
}
