import { Module } from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { EmployeeController } from './employee.controller';
import { SendEmailModule } from 'src/mails/send-email.module';
import { SendEmailService } from 'src/mails/send-email.service';

@Module({
  imports: [SendEmailModule],
  controllers: [EmployeeController],
  providers: [EmployeeService],
})
export class EmployeeModule {}
