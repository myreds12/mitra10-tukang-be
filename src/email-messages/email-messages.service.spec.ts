import { Test, TestingModule } from '@nestjs/testing';
import { EmailMessagesService } from './email-messages.service';

describe('EmailMessagesService', () => {
  let service: EmailMessagesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailMessagesService],
    }).compile();

    service = module.get<EmailMessagesService>(EmailMessagesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
