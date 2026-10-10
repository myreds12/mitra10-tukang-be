/* eslint-disable prettier/prettier */
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { OrderMailInterface } from 'src/common/interface/mails/order-mail-interface';
import { DefaultDataMailInterface } from '../common/interface/mails/default-data-mail-interface';
import { QuotationMailInterface } from 'src/common/interface/mails/quotation-mail-interface';
import { CsiMailInterface } from '../common/interface/mails/csi-mail-interface';
import { RescheduleMailInterface } from '../common/interface/mails/reschedule-mail-interface';
import { RefundMailInterface } from '../common/interface/mails/refund-mail-interface';
import { ComplaintMailInterface } from '../common/interface/mails/complaint-mail-interface';
import { ReplaceTukangFromVendor } from 'src/common/interface/mails/replace-tukang-from-vendor.interface';
import { MailsOrderProcessorService } from './mails-order-processor.service';
import { MailsOperationsProcessorService } from './mails-operations-processor.service';

@Processor('email')
export class EmailProcessor {
  constructor(
    private readonly orderProcessor: MailsOrderProcessorService,
    private readonly operationsProcessor: MailsOperationsProcessorService,
  ) {}

  @Process('send-order-mail')
  async sendOrderMail(job: Job<OrderMailInterface>) {
    return this.orderProcessor.sendOrderMail(job);
  }

  @Process('send-credential-mail')
  async sendCredentialMail(job: Job<any>) {
    return this.orderProcessor.sendCredentialMail(job);
  }

  @Process('send-reset-password-mail')
  async sendMailResetPassword(job: Job<DefaultDataMailInterface>) {
    return this.orderProcessor.sendMailResetPassword(job);
  }

  @Process('send-vendor-submitted-mail')
  async sendVendorSubmittedMail(job: Parameters<MailsOperationsProcessorService['sendVendorSubmittedMail']>[0]) {
    return this.operationsProcessor.sendVendorSubmittedMail(job);
  }

  @Process('send-vendor-pitching-mail')
  async sendVendorPitchingMail(job: Parameters<MailsOperationsProcessorService['sendVendorPitchingMail']>[0]) {
    return this.operationsProcessor.sendVendorPitchingMail(job);
  }

  @Process('send-vendor-approval-mail')
  async sendVendorApprovalMail(job: Parameters<MailsOperationsProcessorService['sendVendorApprovalMail']>[0]) {
    return this.operationsProcessor.sendVendorApprovalMail(job);
  }

  @Process('send-registrant-account-mail')
  async sendRegistrantAccountMail(job: Parameters<MailsOperationsProcessorService['sendRegistrantAccountMail']>[0]) {
    return this.operationsProcessor.sendRegistrantAccountMail(job);
  }

  @Process('send-vendor-rejection-mail')
  async sendVendorRejectionMail(job: Parameters<MailsOperationsProcessorService['sendVendorRejectionMail']>[0]) {
    return this.operationsProcessor.sendVendorRejectionMail(job);
  }

  @Process('send-quotation-mail')
  async sendQuotationMail(job: Job<QuotationMailInterface>) {
    return this.orderProcessor.sendQuotationMail(job);
  }

  @Process('send-quotation-payment-mail')
  async sendQuotationPaymentMail(job: Job<QuotationMailInterface>) {
    return this.orderProcessor.sendQuotationPaymentMail(job);
  }

  @Process('send-csi-mail')
  async sendcsimail(job: Job<CsiMailInterface>) {
    return this.operationsProcessor.sendcsimail(job);
  }

  @Process('send-replace-tukang-from-vendor')
  async sendReplaceTukangFromVendor(job: Job<ReplaceTukangFromVendor>) {
    return this.operationsProcessor.sendReplaceTukangFromVendor(job);
  }

  @Process('send-replace-tukang-from-tukang')
  async sendReplaceTukangFromTukang(job: Job<ReplaceTukangFromVendor>) {
    return this.operationsProcessor.sendReplaceTukangFromTukang(job);
  }

  @Process('send-reschedule-mail')
  async sendRescheduleMail(job: Job<RescheduleMailInterface>) {
    return this.operationsProcessor.sendRescheduleMail(job);
  }

  @Process('send-refund-mail')
  async sendRefundMail(job: Job<RefundMailInterface>) {
    return this.operationsProcessor.sendRefundMail(job);
  }

  @Process('send-complaint-mail')
  async sendComplaintMail(job: Job<ComplaintMailInterface>) {
    return this.operationsProcessor.sendComplaintMail(job);
  }
}
