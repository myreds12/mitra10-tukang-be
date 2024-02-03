import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { OrderService } from 'src/order/order.service';
import * as pug from 'pug';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SendEmailService {
  constructor(private readonly mailerService: MailerService, private readonly orderService: OrderService, private readonly dbService: PrismaService) { }

  async sendMail(order_id: number) {
    const data = await this.orderService.findOne(order_id)
    const mail = await this.mailerService.sendMail({
      to: data.members.email, // list of receivers
      from: 'kreasisawalanusantara@gmail.com', // sender address
      subject: 'Email Order', // Subject line
      template: 'order',
      context: data,
      html: pug.renderFile('templates/index.pug', { data }),
    });

    console.log('SUCCESS');
  }

  async sendMailResetPassword(user_id: number) {
    const data = await this.dbService.users.findFirst({
      where: {
        id: user_id
      },
      include: {
        employee: true,
        vendor: true,
        sales: true,
        tukang: true
      }
    });
    console.log(data);
    

    let userEmail
    if(data.username.includes('@')) userEmail = data.username
    const to =
      userEmail ??
      data.employee?.email ??
      data.vendor?.email_address ??
      data.tukang[0]?.email ??
      'example@example.com';
      console.log(to);
      
    const mail = await this.mailerService.sendMail({
      to,
      from: 'kreasisawalanusantara@gmail.com', // sender address
      subject: 'Email Reset Password', // Subject line
      template: 'reset-password',
      context: data,
      html: pug.renderFile('templates/reset-password.pug', { data }),
    });
    return { message: "Success" };
  }
}
