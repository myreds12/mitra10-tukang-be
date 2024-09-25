import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateLoginDto } from './dto/login.dto';
import { CreateRegisterDto } from './dto/register.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { compare, hash, hashSync } from 'bcrypt';
import { JwtConfig } from 'src/jwt.config';
import { omit } from 'lodash';
import { JwtService } from '@nestjs/jwt';
import { Prisma, users } from '@prisma/client';
import { PermissionAction } from 'src/casl/enum/permission-action.enum';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { isFQDN } from 'class-validator';
// import { PermissionAction } from '../casl/factory/casl-ability.factory';

@Injectable()
export class AuthService {
  constructor(
    private readonly dbService: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: CreateRegisterDto, role_id?: number | null) {
    try {
      const user = await this.dbService.users.findFirst({
        where: {
          username: dto.username,
        },
      });

      if (user) {
        throw new BadRequestException(
          'Username tersebut sudah ada, silahkan buat dengan username lain.',
        );
      }

      const formattedUsername = dto.username.replace(/ /g, '_');

      if(formattedUsername.length > 20){
        throw new BadRequestException('Username tidak boleh lebih dari 20 karakter.');
      }

      const [createUser] = await this.dbService.$transaction([
        this.dbService.users.create({
          data: {
            username: formattedUsername,
            password: await hashSync(dto.password, 12),
            role_id: dto.role_id,
            //FIXME: CHECK THIS CODE
            ...(dto.vendor_id
              ? {
                  pic_vendor: {
                    create: {
                      pic_name: dto.pic_name,
                      vendor: {
                        connect: {
                          id: dto.vendor_id,
                        },
                      },
                      email_address: dto.email,
                    },
                  },
                }
              : undefined),
          },
        }),
      ]);

      return createUser;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async updateUser(id: number, dto: UpdateUserDto, files?: Express.Multer.File) {
    try {
      const user = await this.dbService.users.findFirst({
        where: {
          id,
        },
      });

      
      
      if (!user) {
        throw new NotFoundException('User tidak ada.');
      }

      const update = await this.dbService.users.update({
        where: {
          id,
        },
        data: {
          username: dto.username,
          password: dto?.password ? await hash(dto.password, 12) : undefined,
          ...(dto.id_pic
            ? {
                pic_vendor: {
                  update: {
                    where: {
                      id: dto.id_pic,
                    },
                    data: {
                      pic_name: dto.pic_name,
                      email_address: dto.email,
                    },
                  },
                },
              }
            : undefined),
          ...(files ? {
            profile_picture: files.filename
          } : undefined)
        },
      });

      return update;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async updateAllUsersForTesting(take: number = 100) {
    try {
      let updatedUsers = [];
      let batchNumber = 0;
  
      while (true) {
        // Mengambil 100 user per batch
        const users = await this.dbService.users.findMany({
          skip: batchNumber * take, // Skip sejumlah batch yang sudah diambil
          take: take,               // Ambil sejumlah take user
        });
  
        // Jika tidak ada user yang diambil, hentikan loop
        if (users.length === 0) {
          break;
        }
  
        // Update setiap user dalam batch
        const updatedBatch = await Promise.all(
          users.map(async (user) => {
            const updatedUser = await this.dbService.users.update({
              where: {
                id: user.id,
              },
              data: {
                username: `${user.username}_testing`, // Tambah _testing pada username
                password: await hash('passworduntuktesting', 12), // Hash password baru
              },
            });
            return updatedUser;
          })
        );
  
        // Tambahkan hasil batch ke array total updatedUsers
        updatedUsers = [...updatedUsers, ...updatedBatch];
  
        // Tingkatkan nomor batch
        batchNumber++;
      }
  
      return updatedUsers; // Mengembalikan semua user yang telah diperbarui
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async deleteUser(id: number) {
    try {
      const user = await this.dbService.users.findFirst({
        where: {
          id,
        },
        include: {
          roles: true
        }
      });

      if (!user || user.deleted_at) {
        throw new NotFoundException('User tidak ada.');
      }


      const deleteUser = await this.dbService.users.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
        }
      });
      return deleteUser;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async login(dto: CreateLoginDto) {
    try {
      const user = await this.dbService.users.findFirst({
        where: {
          username: {
            equals: dto.username,
          },
          
        },
        include: {
          tukang: true,
          store: {
            select: {
              id: true,
              store_name: true,
              address: true,
              phone_number_1: true,
              phone_number_2: true,
              email: true,
              area: true
            }
          },
          roles: {
            select: { id: true ,name: true },
          },
          employee: {
            select: {
              user_id: true,
              full_name: true,
              email: true,
              phone_number: true,
              nik: true,
              whatsapp_number: true,
              store: {
                select: {
                  id: true,
                  store_name: true,
                  area: true
                },
              },
            },
          },
          sales: {
            select: {
              id: true,
              user_id: true,
              full_name: true,
              account_name: true,
              account_number: true,
              bank_id: true,
              phone_number: true,
              sales_brand: true,
              is_active: true,
              deleted_at: true,
              store: {
                select: {
                  id: true,
                  store_name: true,
                },
              },
            },
          },
          pic_vendor: {
            include: {
              vendor: true,
            },
          },
        },
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      const checkPassword = await compare(dto.password, user.password);
      if (!checkPassword) {
        throw new HttpException(
          'Username atau Password salah',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const roles = await this.dbService.roles.findFirst({
        where: {
          name: {
            contains: 'sales'
          }
        }
      });

      if (user.roles.id === roles.id) {
        const salesData = user.sales[0];
        const requiredFields = ['id','full_name', 'bank_id', 'account_name', 'account_number', 'phone_number', 'sales_brand'];

        const isSalesDataIncomplete = requiredFields.some(field => !salesData[field]);
        if (isSalesDataIncomplete || !salesData.store?.id) {

          throw new HttpException('Data sales tidak lengkap, mohon untuk menghubungi admin toko', HttpStatus.FORBIDDEN);
        }
        if(salesData.is_active === false){
          throw new HttpException('Akun anda tidak aktif, mohon hubungi admin toko', HttpStatus.FORBIDDEN);
        }

        if(salesData.deleted_at){
          throw new HttpException('Akun anda sudah dihapus, mohon untuk registrasi ulang ke admin toko', HttpStatus.FORBIDDEN);
        }
      }

      if(user.deleted_at){
        throw new HttpException('Akun anda sudah dihapus, mohon untuk menghubungi kepada admin yang bersangkutan', HttpStatus.FORBIDDEN);
      }

      return await this.generateJwt(
        user,
        JwtConfig.user_secret,
        JwtConfig.user_expired,
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
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
    try {
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
    } catch (error) {
      console.error(error);
      throw error;
    }
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
      accessToken: accessToken,
      user: omit(user, ['password', 'created_at', 'updated_at', 'deleted_at']),
      role,
      permission,
    };
  }

  async getUserPermission(user: users) {
    const userData = await this.getUser({ id: user.id });

    const permissions = userData.roles.role_permissions.map((x) => ({
      ...x.permissions,
      name: PermissionAction[x.permissions.name.toUpperCase()],
    }));

    return permissions;
  }

  async resetPassword(username: string) {
    try {
      const user = await this.dbService.users.findFirst({
        where: {
          username: username,
        },
      });

      if (!user) throw new NotFoundException('User Not Found!!');

      const userUpdate = await this.dbService.users.update({
        where: {
          id: user.id,
        },
        data: {
          forget_password: new Date(),
        },
      });

      return omit(userUpdate, [
        'password',
        'forget_password',
        'created_at',
        'updated_at',
        'deleted_at',
      ]);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findAll(query: QueryParamsDto) {
    try {
      const { page, take, search, date_from, date_to, vendor_id, store_id } =
        query;
      const skip = page * take - take;

      const where: Prisma.usersWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [{ username: { contains: search } }],
                },
              ]
            : []),
          ...(vendor_id
            ? [
                {
                  pic_vendor: {
                    some: {
                      vendor_id: vendor_id,
                    },
                  },
                },
              ]
            : []),
          ...(store_id
            ? [
                {
                  store: {
                    some: {
                      id: { in: store_id },
                    },
                  },
                },
              ]
            : []),
          ...(date_from && date_to
            ? [
                {
                  created_at: {
                    gte: new Date(date_from),
                    lte: new Date(`${date_to}T23:59:59.000Z`),
                  },
                },
              ]
            : []),
        ].filter(Boolean),
        deleted_at: null,
      };
      const getTake = () => {
        if (take <= 0) {
          return 100;
        }
        return take;
      };

      const user = await this.dbService.users.findMany({
        where,
        skip,
        take: getTake(),
        include: {
          employee: true,
          store: true,
          roles: true,
          sales: true,
          tukang: true,
          pic_vendor: {
            include: {
              vendor: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      const total = await this.dbService.users.count({
        where,
      });

      return {
        data: user,
        meta: { total, page, take, skip },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const user = await this.dbService.users.findFirst({
        where: {
          id,
        },
        include: {
          employee: true,
          roles: true,
          sales: true,
          store: true,
          tukang: true,
          pic_vendor: {
            include: {
              vendor: true,
            },
          },
        },
      });

      if (!user) throw new NotFoundException('User Not Found!!');

      return user;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async getUsers(username: string) {
    try {
      const user = await this.dbService.users.findFirst({
        where: {
          username: username,
        },
      });

      if (!user) throw new NotFoundException('User Not Found!!');

      return user;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
