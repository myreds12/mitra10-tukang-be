import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ComplaintChannelsService {
  constructor(private readonly dbService: PrismaService) {}

  async findAll() {
    return this.dbService.complaint_channels.findMany();
  }
}
