import { Test, TestingModule } from '@nestjs/testing';
import { EmailMessagesController } from './email-messages.controller';
import { EmailMessagesService } from './email-messages.service';

describe('EmailMessagesController', () => {
  let controller: EmailMessagesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailMessagesController],
      providers: [EmailMessagesService],
    }).compile();

    controller = module.get<EmailMessagesController>(EmailMessagesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
