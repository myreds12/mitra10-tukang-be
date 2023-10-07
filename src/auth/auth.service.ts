import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateLoginDto } from './dto/login.dto';
import { CreateRegisterDto } from './dto/register.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { compare, hash } from 'bcrypt';
import { JwtConfig } from 'src/jwt.config';
import { omit } from 'lodash';
import { JwtService } from '@nestjs/jwt';
import { Prisma, users } from '@prisma/client';

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
        roles: true,
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
  async generateJwt(
    user: users,
    secret: any,
    expired = JwtConfig.user_expired,
  ) {
    const { id, username } = user;
    console.log(user);
    
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
    // const menus = await this.dbService.user_menu_permissions.findMany({
    //   where: { user_id: user.id },
    //   include: {
    //     menus: true,
    //   },
    // });

    // const roles = await this.dbService.user_roles.findMany({
    //   where: {
    //     user_id: user.id,
    //   },
    //   include: {
    //     roles: {
    //       select: {
    //         name: true,
    //       },
    //     },
    //   },
    // });

    return {
      statusCode: 200,
      accessToken: accessToken,
      user: omit(user, ['password', 'created_at', 'updated_at', 'deleted_at']),
      // menu: menus,
      // roles: roles,
    };
  }
  async getUserPermission(user: users) {
    const userData = this.dbService.users.findFirst({
      where: {
        id: user.id,
      },
      // select: {
      //   username: true,
      //   user_roles: {
      //     select: {
      //       user_id: true,
      //       role_id: true,
      //       roles: {
      //         select: {
      //           name: true,
      //           role_menus: {
      //             select: {
      //               menu_id: true,
      //               role_id: true,
      //               menus: {
      //                 select: {
      //                   title: true,
      //                   url: true,
      //                   icon: true,
      //                 },
      //               },
      //             },
      //           },
      //         },
      //       },
      //     },
      //   },
      // },
    });

    return userData;
  }
}
