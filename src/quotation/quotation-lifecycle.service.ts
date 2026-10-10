/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';
import { users, quotation } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';

@Injectable()
export class QuotationLifecycleService {
  private readonly logger = new Logger(QuotationLifecycleService.name);

  constructor(
    private readonly dbService: PrismaService,
    private readonly notifService: NotificationsService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  async remove(id: number, user_id: number) {
    try {
      await this.dbService.quotation.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });
    } catch (error) {
      console.error(error);

      throw error;
    }
  }



  async setStatus(id: number, status_id: number, user: users) {
    const { id: user_id } = user;
    const status = await this.dbService.status.findFirst({
      where: {
        id: status_id,
      },
    });
    if (!status) throw new BadRequestException('Status Id not found!');

    const quotationFind = await this.dbService.quotation.findFirst({
      where: {
        id,
      },
      include: {
        status: true,
      },
    });

    if (!quotationFind) throw new BadRequestException('Quotation not found!');
    // if (quotationFind.status.category.toLowerCase().includes('quoteout'))
    //   throw new BadRequestException('Cannot change status!');

    const quotation = await this.dbService.quotation.update({
      where: {
        id,
      },
      data: {
        quotation_status: status.id,
        updated_at: new Date(),
        updated_by: user_id,
      },
    });

    if (status.category === 'QUOTEOUT' && quotationFind.status?.category !== 'QUOTEOUT') {
      try {
        await this.whatsAppService.sendQuotationNotification(quotation.id);
      } catch (err) {
        console.error('WA quotation notification failed:', err);
      }
    }

    return quotation;
  }



  async incentiveDuplicate(id: number) {
    try {
      const incentives = await this.dbService.sales_incentive.findMany({
        where: { quotation_id: id },
        orderBy: { created_at: 'desc' },
        include: {
          incentive: true,
          quotation: true,
        },
      });

      // console.log("INCENTIVE", incentives.length);


      if (incentives.length > 1) {
        const incentiveToKeep = incentives[0];
        let comission = 0;
        if (incentiveToKeep.incentive.type === 1) {
          comission +=
            Number(incentiveToKeep.quotation.quotation_grand_total) *
            (Number(incentiveToKeep.incentive.incentive) / 100);
        } else if (incentiveToKeep.incentive.type === 2) {
          comission += Number(incentiveToKeep.incentive.incentive);
        }

        const idsToDelete = incentives
          .filter((incentive) => incentive.id !== incentiveToKeep.id)
          .map((incentive) => incentive.id);

        await this.dbService.sales_incentive.deleteMany({
          where: { id: { in: idsToDelete } },
        });

        await this.dbService.sales_incentive.update({
          where: { id: incentiveToKeep.id },
          data: {
            nominal: comission,
          },
        });

        // console.log(
        //   `Deleted ${idsToDelete.length} incentives for quotation_id=${id}, kept one.`,
        // );
      } else if (incentives.length === 1) {
        const incentiveToKeep = incentives[0];
        let comission = 0;
        if (incentiveToKeep.incentive.type === 1) {
          comission +=
            Number(incentiveToKeep.quotation.quotation_grand_total) *
            (Number(incentiveToKeep.incentive.incentive) / 100);
        } else if (incentiveToKeep.incentive.type === 2) {
          comission += Number(incentiveToKeep.incentive.incentive);
        }

        // console.log("COMISSION", comission);


        await this.dbService.sales_incentive.update({
          where: { id: incentiveToKeep.id },
          data: {
            nominal: comission,
          },
        });
      } else {
        // console.log('No incentives found for the given quotation_id.');
      }
    } catch (error) {
      console.log(error);

      throw error;
    }
  }



  async updatePromotionQuotation() {
    try {
      const quotationNoPromotion = await this.dbService.quotation.findMany({
        where: {
          quotation_grand_total: {
            gte: 2000000
          },
          promotion_id: null
        }
      });

      const promotions = await this.dbService.promotion.findFirst({
        where: {
          deleted_at: null,
          min_order: {
            gte: 2000000
          }
        }
      });

      if (promotions) {
        const updateQuotation = await Promise.all(
          quotationNoPromotion.map(async (quotation) => {
            const discountAmount =
              promotions.promotion_type === 1
                ? Number(quotation.quotation_grand_total) * (Number(promotions.promotion) / 100)
                : Number(promotions.promotion);

            return this.dbService.quotation.update({
              where: { id: quotation.id },
              data: {
                promotion_id: promotions.id,
                quotation_grand_total: Number(quotation.quotation_grand_total) - discountAmount,
              },
            });
          })
        );

        return updateQuotation;
      }

      return { message: "No promotions available" };


      return 'Gagal';
    } catch (error) {
      console.error();
      throw error;
    }
  }



  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkvalidity() {
    if ((process.env.NODE_APP_INSTANCE ?? '0') !== '0') return;
    try {
      // console.log('init checkvalidity');
      this.logger.log('init checkvalidity');
      const quotations = await this.dbService.quotation.findMany({
        where: {
          status: {
            category: {
              contains: 'QUOTEOUT',
            },
          },
          OR: [
            { quotation_receipt: { every: { receipt_quotation: null } } },
            { receipt_quotation: null },
          ],
          quotation_validity: {
            lte: new Date(),
          },
        },
        include: {
          order: true,
        },
      });

      // console.log(`Found ${quotations.length} quotations`);

      if (!quotations.length) {
        // console.log('No quotation found');
        this.logger.log('No quotation found');
        return 0;
      }

      // console.log(`${quotations.length} quotation found`);
      this.logger.log(`${quotations.length} quotation found`);

      const NEWSTATUS = await this.dbService.status.findFirst({
        where: {
          category: {
            in: ['CLOSED'],
          },
        },
      });

      await Promise.all(
        quotations.map(async (quotation) => {
          const { id } = quotation;
          // console.log(`Updating quotation ${id}`);

          // Update the quotation status
          await this.dbService.quotation.update({
            where: {
              id,
            },
            data: {
              quotation_status: NEWSTATUS.id,
            },
          });

          await this.notifService.create(
            {
              quotation: quotation,
              orders: quotation.order,
            },
            'UPDATE',
            quotation.updated_by,
            moduleTypeNotification.QUOTATION,
            quotation.id,
            quotation.quotation_status,
          );

        }),
      );

      await this.dbService.sales_incentive.updateMany({
        where: {
          quotation: {
            order: {
              refund: {
                some: {}
              }
            }
          }
        },
        data: {
          status: IncentiveStatus.LOST_INCENTIVE,
          updated_at: new Date()
        }
      })

      console.log('Finished checkvalidity');
      return 1;
    } catch (error) {
      console.error(error);
      this.logger.error(error);
      throw error;
    }
  }



  async generateSalesIncentive(
    grandTotal: number,
    storeId: number,
    salesId: number,
    quotation: quotation,
  ) {
    const { id: quotation_id, order_id, quotation_status } = quotation;

    // Mengambil status dari database
    const statusList = await this.dbService.status.findMany({
      select: {
        id: true,
        category: true,
        description: true,
      }
    });

    const stepTwoStatus = statusList.find(item => item.description === 'QUOTATIONPAIDSTEPTWO')?.id;
    const stepThreeStatus = statusList.find(item => item.description === 'QUOTATIONPAIDSTEPTHREE')?.id;

    if (quotation_status === stepTwoStatus || quotation_status === stepThreeStatus) {
      grandTotal *= 0.5;
    }

    console.log("GRAND TOTAL", grandTotal);
    console.log("STORE ID", storeId);

    const filteredIncentive = await this.dbService.setting_incentive.findMany({
      where: {
        deleted_at: null,
        stores: {
          some: { store_id: storeId },
        },
        min_order: { lte: grandTotal },
        max_order: { gte: grandTotal },
      },
    });


    console.log("INCENTIVE FILTER", filteredIncentive);

    const closestIncentive =
      filteredIncentive.length > 0
        ? filteredIncentive.reduce((closest, current) =>
          Math.abs(Number(current.min_order) - grandTotal) <
            Math.abs(Number(closest.min_order) - grandTotal)
            ? current
            : closest,
        )
        : null;

    console.log("INCENTIVE CLOSEST", closestIncentive);
    if (!closestIncentive) {
      return null;
    }

    if (!closestIncentive) return null;

    let comission = 0;
    if (closestIncentive.type === 1) {
      comission += grandTotal * (Number(closestIncentive.incentive) / 100);
    } else if (closestIncentive.type === 2) {
      comission += Number(closestIncentive.incentive);
    }

    const salesIncentive = await this.dbService.sales_incentive.create({
      data: {
        incentive: {
          connect: {
            id: closestIncentive.id,
          },
        },
        sales: {
          connect: {
            id: salesId,
          },
        },
        quotation: {
          connect: {
            id: quotation_id,
          },
        },
        nominal: Math.floor(comission),
        status: IncentiveStatus.POTENTIAL_INCENTIVE,
        created_by: quotation.updated_by,
      },
      include: {
        quotation: {
          include: {
            order: true,
          },
        },
      },
    });

    if (salesIncentive) {
      await this.notifService.create(
        {
          sales_incentive: salesIncentive,
          orders: salesIncentive.quotation.order,
        },
        'CREATE',
        salesIncentive.created_by,
        moduleTypeNotification.INCENTIVE,
        salesIncentive.id,
        salesIncentive.status,
      );
    }

    await this.dbService.orders.update({
      where: { id: order_id },
      data: { grand_total_comission: salesIncentive.nominal },
    });
  }


}
