import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateLoginDto } from './dto/login.dto';
import { CreateRegisterDto } from './dto/register.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { compare } from 'bcrypt';
import { JwtConfig } from 'src/jwt.config';
import { omit } from 'lodash';
import { JwtService } from '@nestjs/jwt';
import { Prisma, users } from '@prisma/client';
import { PermissionAction } from 'src/casl/enum/permission-action.enum';
// import { PermissionAction } from '../casl/factory/casl-ability.factory';

@Injectable()
export class AuthService {
  constructor(
    private readonly dbService: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: CreateRegisterDto) {
    const user = await this.dbService.users.findFirst({
      where: {
        username: dto.username,
      },
    });
    if (user) {
      throw new HttpException('User Exists', HttpStatus.BAD_REQUEST);
    }
    const createUser = await this.dbService.users.create({
      data: { ...dto, role_id: 2 },
    });
    if (createUser) {
      return {
        statusCode: 200,
        message: 'Register success',
        data: createUser,
      };
    }
    throw new HttpException('Bad request', HttpStatus.BAD_REQUEST);
  }

  async login(dto: CreateLoginDto) {
    const user = await this.dbService.users.findFirst({
      where: { username: dto.username },
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
      },
    });

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

  async generateJwt(
    user: users,
    secret: any,
    expired = JwtConfig.user_expired,
  ) {
    const { id, username } = user;

    const accessToken = this.jwtService.sign(
      {
        id: id,
        username,
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
}
