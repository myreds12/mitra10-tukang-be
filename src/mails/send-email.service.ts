import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class SendEmailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendMail(to: string = 'test@nestjs.com', text: string = '') {
    const mail = await this.mailerService.sendMail({
      to, // list of receivers
      from: 'noreply@nestjs.com', // sender address
      subject: 'Testing Nest MailerModule ✔', // Subject line
      template: 'order'
    });

    console.log('mailer', mail);
  }
}
