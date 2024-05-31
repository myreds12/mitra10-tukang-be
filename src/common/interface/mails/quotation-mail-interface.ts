import { DefaultDataMailInterface } from './default-data-mail-interface';

export interface QuotationMailInterface extends DefaultDataMailInterface {
  orderId: number;
  to: string;
}
