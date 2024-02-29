import { Injectable, NotFoundException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { OrderService } from 'src/order/order.service';
import * as pug from 'pug';
import * as pdf from 'html-pdf';
import { PrismaService } from 'src/prisma/prisma.service';
import * as path from 'path';

@Injectable()
export class SendEmailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly orderService: OrderService,
    private readonly dbService: PrismaService,
  ) {}

  async generatePDF(data: any): Promise<string> {
    const folderPath = './uploads/file/';
    const filePath = path.join(folderPath, `order${data.id}.pdf`);
    const template = pug.renderFile('templates/index.pug', { data });

    const options: pdf.CreateOptions = {
      format: 'A4',
      border: '10mm',
    };

    await new Promise<void>((resolve, reject) => {
      pdf.create(template, options).toFile(filePath, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    return filePath;
  }

  async sendMail(order_id: number) {
    const data = await this.orderService.findOne(order_id);

    await this.mailerService.sendMail({
      to: data.members.email, // list of receivers
      from: 'noreply@mitra10.com', // sender address
      subject: 'Email Order', // Subject line
      template: 'order',
      context: data,
      // html: pug.renderFile('templates/index.pug', { data }),
      //   attachments: [
      //     {
      //         filename: 'order.pdf',
      //         content: generatePdf,
      //         encoding: 'base64',
      //         cid: 'noreply@mitra10.com', // Ganti dengan CID yang unik
      //     },
      // ],
    });
  }

  async sendMailResetPassword(user_id: number) {
    const data = await this.dbService.users.findFirst({
      where: {
        id: user_id,
      },
      include: {
        employee: true,
        vendor: true,
        sales: true,
        tukang: true,
      },
    });

    let to = data.username.includes('@')
      ? data.username
      : data.employee?.email ??
        data.vendor?.email_address ??
        data.tukang[0]?.email ??
        'example@example.com';
    console.log(to);

    await this.mailerService.sendMail({
      to,
      from: 'noreply@mitra10.com', // sender address
      subject: 'Email Reset Password', // Subject line
      template: 'reset-password',
      context: data,
      // html: pug.renderFile('templates/reset-password.pug', { data }),
    });
  }

  async sendCredentialMail(username: string, password: string) {
    const data = {
      username,
      password,
    };
    const users = await this.dbService.users.findFirst({
      where: {
        username,
      },
      include: {
        employee: true,
        vendor: true,
        sales: true,
        tukang: true,
      },
    });
    if (!users) throw new NotFoundException('User  not found!');

    const userEmail = users.username.includes('@') ? users.username : null;
    const to =
      userEmail ||
      users.employee?.email ||
      users.vendor?.email_address ||
      users.tukang[0]?.email ||
      'example@example.com';

    await this.mailerService.sendMail({
      to,
      from: 'noreply@mitra10.com', // sender address
      subject: 'Credential Mail', // Subject line
      template: 'credential-mail',
      context: [data, users],
      html: pug.renderFile('templates/credential-mail.pug', { data }),
    });
  }
}
