import { Module } from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { EmployeeController } from './employee.controller';
import { SendEmailService } from 'src/mails/send-email.service';
import { StatusService } from 'src/status/status.service';

@Module({
  controllers: [EmployeeController, StatusService, SendEmailService],
  providers: [EmployeeService],
})
export class EmployeeModule {}
