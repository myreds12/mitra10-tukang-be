import { Injectable } from '@nestjs/common';
import { MailerService  } from '@nestjs-modules/mailer';
import { OrderService } from 'src/order/order.service';
import * as pug from 'pug';

@Injectable()
export class SendEmailService {
  constructor(private readonly mailerService: MailerService, private readonly orderService: OrderService) {}

  async sendMail(order_id: number) {
    const data = await this.orderService.findOne(order_id)
    const mail = await this.mailerService.sendMail({
      to: data.members.email, // list of receivers
      from: 'kreasisawalanusantara@gmail.com', // sender address
      subject: 'Testing Nest MailerModule ✔', // Subject line
      template: 'order',
      context: data,
      html: pug.renderFile('templates/index.pug', { data }),
    });

    console.log('mailer', mail);
  }
}
