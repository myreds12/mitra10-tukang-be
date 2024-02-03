import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { OrderService } from 'src/order/order.service';
import * as pug from 'pug';
import * as fs from 'fs';
import * as pdfkit from 'pdfkit';
import 'jspdf-autotable';
import { PrismaService } from 'src/prisma/prisma.service';
import path from 'path';

@Injectable()
export class SendEmailService {
  constructor(private readonly mailerService: MailerService, private readonly orderService: OrderService, private readonly dbService: PrismaService) { }

  async generatePDF(data: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const pdfStream = new pdfkit();
        const buffers: Buffer[] = [];

        pdfStream.on('data', (buffer) => {
            buffers.push(buffer);
        });

        pdfStream.on('end', () => {
            resolve(Buffer.concat(buffers));
        });

        pdfStream.on('error', (error) => {
            reject(error);
        });

        pdfStream.pipe(fs.createWriteStream('uploads/pdf/')); 
        pdfStream.end();
    });
}

  async sendMail(order_id: number) {
    const data = await this.orderService.findOne(order_id)
    const generatePdf = await this.generatePDF(data)

    await this.mailerService.sendMail({
      to: data.members.email, // list of receivers
      from: 'kreasisawalanusantara@gmail.com', // sender address
      subject: 'Email Order', // Subject line
      template: 'order',
      context: data,
      html: pug.renderFile('templates/index.pug', { data }),
      attachments: [
        {
            filename: 'order.pdf',
            content: generatePdf,
            encoding: 'base64',
            cid: 'unique@kreasisawalanusantara.com', // Ganti dengan CID yang unik
        },
    ],
    });


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
  }
}
