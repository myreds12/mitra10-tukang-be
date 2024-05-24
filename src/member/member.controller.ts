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
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MemberService } from './member.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { ApiTags } from '@nestjs/swagger';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';

@ApiTags('Members')
@UseGuards(JwtAuthGuard)
@Controller('member')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Post('/')
  @HttpCode(201)
  create(
    @Body() createMemberDto: CreateMemberDto,
    @Req() req: RequestWithUser,
  ) {
    const user_id = req.user.id;
    return this.memberService.create(createMemberDto, user_id);
  }

  @Get('/')
  findAll(@Query() query: QueryParamsDto, @Req() req: RequestWithUser) {
    const user_id = req.user.id;
    return this.memberService.findAll(query, user_id);
  }

  @Get('/:id')
  findOne(@Param('id') id: string) {
    return this.memberService.findOne(+id);
  }

  @Post('/:id')
  @HttpCode(HttpStatus.ACCEPTED)
  update(
    @Param('id') id: string,
    @Body() updateMemberDto: UpdateMemberDto,
    @Req() req: RequestWithUser,
  ) {
    const user_id = req.user.id;
    return this.memberService.update(+id, updateMemberDto, user_id);
  }

  @Delete('/:id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user_id = req.user.id;
    return this.memberService.remove(+id, user_id);
  }
}
