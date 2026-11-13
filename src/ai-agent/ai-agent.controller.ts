import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CaslAbilityFactory } from '../casl/factory/casl-ability.factory';
import { PermissionAction } from '../casl/enum/permission-action.enum';
import { PrismaService } from '../prisma/prisma.service';
import { AiAgentService } from './ai-agent.service';
import { PRIVACY_FIELDS } from './privacy-policy';

class ChatDto {
  @IsString() @MinLength(1) @MaxLength(2000) question: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) conversation_id?: number;
  @IsArray() @ArrayMaxSize(PRIVACY_FIELDS.length) @ArrayUnique() @IsIn(PRIVACY_FIELDS, { each: true }) allowed_fields: string[];
}
class PeriodDto {
  @IsOptional() @IsString() @MaxLength(10) from?: string;
  @IsOptional() @IsString() @MaxLength(10) to?: string;
}
@Injectable()
export class AiAgentGuard implements CanActivate {
  constructor(private readonly db: PrismaService, private readonly casl: CaslAbilityFactory) {}
  async canActivate(ctx: ExecutionContext) {
    const user = ctx.switchToHttp().getRequest().user;
    const current = await this.db.users.findFirst({ where: { id: user.id, is_active: true, deleted_at: null, roles: { is_active: true, deleted_at: null, name: { in: ['Admin HO', 'Super User'] }, role_permissions: { some: { deleted_at: null, permissions: { name: 'read', is_active: true, deleted_at: null, menus: { title: 'AI Agent', is_active: true, deleted_at: null } } } } } }, select: { id: true } });
    if (!current || !(await this.casl.createForUser(user)).can(PermissionAction.READ, 'ai agent')) throw new ForbiddenException('Anda tidak memiliki izin AI Agent');
    return true;
  }
}
@Controller('ai-agent')
@UseGuards(JwtAuthGuard, AiAgentGuard)
export class AiAgentController {
  constructor(private readonly service: AiAgentService) {}
  @Post('chat') chat(@Req() req: any, @Body() body: ChatDto) { const question = body.question.trim(); if (!question) throw new ForbiddenException('Pertanyaan harus diisi'); return this.service.chat(req.user.id, question, body.conversation_id, body.allowed_fields); }
  @Get('dashboard') dashboard(@Query() query: PeriodDto) { return this.service.dashboard(query); }
  @Get('health') health() { return this.service.health(); }
  @Get('conversations') conversations(@Req() req: any) { return this.service.conversations(req.user.id); }
  @Get('summary/transaction') transaction(@Query() query: PeriodDto) { return this.service.summary('get_transaction_summary', query); }
  @Get('summary/work-order') workOrder(@Query() query: PeriodDto) { return this.service.summary('get_work_order_summary', query); }
  @Get('work-patterns') workPatterns(@Query() query: PeriodDto) { return this.service.summary('get_work_patterns', query); }
}
