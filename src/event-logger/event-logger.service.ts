import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from 'src/prisma/prisma.service';
import EventLoggerDto from './dto/event-logger.dto';

@Injectable()
export class EventLoggerService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly dbService: PrismaService,
  ) { }

  @OnEvent('create.logger')
  handleCreateModuleLogger(payload: EventLoggerDto) {
    const properties = JSON.stringify(payload.properties);
    const data = this.dbService.logs
      .create({
        data: {
          issuer_id: payload.issuer_id,
          issuer_type: payload.issuer_type.toLowerCase(),
          module_id: payload.module_id,
          module_type: payload.module_type,
          properties: properties,
        },
      })
    // .then((succ) => console.log(succ))
    // .catch((err) => console.log(err));
    // console.log('ccrot', payload, properties, data);
  }
}
