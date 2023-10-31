import { Injectable, HttpStatus } from '@nestjs/common';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash } from 'bcrypt';

@Injectable()
export class MemberService {
  constructor(private readonly dbService: PrismaService) { }

  async create(createMemberDto: CreateMemberDto, user_id) {
    try {
      const email_check = await this.dbService.members.findFirst({
        where: { email: createMemberDto.email },
      });
      if (email_check) throw new Error('Email already exist!');
      const member = await this.dbService.members.create({
        data: {
          full_name: createMemberDto.full_name,
          email: createMemberDto.email,
          address_1: createMemberDto.address_1,
          join_date: createMemberDto.join_date ? new Date(createMemberDto.join_date) : new Date(),
          phone_number: createMemberDto.phone_number,
          whatsapp_number: createMemberDto.whatsapp_number,
          zip_code: createMemberDto.zip_code,
          //join location diisi dengan store id
          join_location: createMemberDto.join_location ? createMemberDto.join_location : null,
          created_by: user_id,
        },
      });

      const user = await this.dbService.users.create({
        data: {
          username: member.full_name,
          password: await hash('tukanginwebsite165', 10),
          role_id: 7
        },
      });

      // const create_user_roles = await this.dbService.user_roles.create({
      //   data: {
      //     users: {
      //       connect: { id: user.id }, // Assuming user_id is the ID of the user you're connecting
      //     },
      //     roles: {
      //       connect: { id: 1 }, // Assuming 1 is the ID of the role you're connecting
      //     },
      //   },
      // });
      // const user_data = await this.dbService.user_roles.findUnique({
      //   where: { id: create_user_roles.id },
      //   include: { users: true, roles: true },
      // });

      return {
        data: {
          member,
          user,
        },
        status: HttpStatus.CREATED,
        message: 'Successfully Create Data',
      };
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        message: error.message ?? 'Failed to Create Data',
      };
    }
  }

  async findAll() {
    try {
      const member = await this.dbService.members.findMany();
      return {
        data: {
          member,
        },
        status: HttpStatus.OK,
        message: 'Successfully get data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to get data',
      };
    }
  }

  async findOne(id: number) {
    try {
      const member = await this.dbService.members.findFirst({
        where: { id: id },
        include: {
          order: {
            include: {
              complaints: true,
              invoices: true
            }
          }
        }
      });
      console.log(member);


      return {
        data: { member },
        status: HttpStatus.OK,
        message: 'Successfully get data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to get data',
      };
    }
  }

  async update(id: number, updateMemberDto: UpdateMemberDto, user_id) {
    try {
      const updated_member = await this.dbService.members.update({
        where: { id: id },
        data: {
          ...updateMemberDto,
          updated_at: new Date(),
          updated_by: user_id,
        },
      });

      return {
        data: { updated_member },
        status: HttpStatus.CREATED,
        message: 'Successfully update member data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to update member data',
      };
    }
  }

  async remove(id: number, user_id) {
    try {
      const delete_member = await this.dbService.members.update({
        where: { id: id },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully Delete Data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed To Delete Data',
      };
    }
  }
}
