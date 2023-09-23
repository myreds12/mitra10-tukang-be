import { Test, TestingModule } from '@nestjs/testing';
import { EventLoggerService } from './event-logger.service';

describe('EventLoggerService', () => {
  let service: EventLoggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventLoggerService],
    }).compile();

    service = module.get<EventLoggerService>(EventLoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
