import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Req,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { MemberService } from './member.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('member')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Post('/')
  create(@Body() createMemberDto: CreateMemberDto, @Req() req) {
    const user_id = req.user.id;
    return this.memberService.create(createMemberDto, user_id);
  }

  @Get('/')
  findAll() {
    return this.memberService.findAll();
  }

  @Get('/id')
  findOne(@Param('id') id: string) {
    return this.memberService.findOne(+id);
  }

  @Post('/:id')
  update(
    @Param('id') id: string,
    @Body() updateMemberDto: UpdateMemberDto,
    @Req() req,
  ) {
    const user_id = req.user.id;
    return this.memberService.update(+id, updateMemberDto, user_id);
  }

  @Delete('/:id')
  remove(@Param('id') id: string, @Req() req) {
    const user_id = req.user.id;
    return this.memberService.remove(+id, user_id);
  }
}
