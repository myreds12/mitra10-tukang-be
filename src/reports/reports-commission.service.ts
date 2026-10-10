/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Injectable()
export class ReportsCommissionService {
  private readonly logger = new Logger(ReportsCommissionService.name);

  constructor(private readonly dbService: PrismaService) {}

async salesComissionReport(query: QueryParamsDto) {
    try {
      const {
        sales_id,
        store_id,
        page,
        take,
        date_from,
        date_to,
        status,
        search,
      } = query;
      const skip = page * take - take;
      const where: Prisma.sales_incentiveWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    {
                      quotation: {
                        order_id: !isNaN(+search) ? +search : undefined,
                      },
                    },
                    {
                      quotation: {
                        order: {
                          members: {
                            full_name: {
                              contains: search,
                            },
                          },
                        },
                      },
                    },
                    {
                      sales: {
                        full_name: {
                          contains: search,
                        },
                      },
                    },
                    {
                      nominal: !isNaN(+search) ? +search : undefined,
                    },
                    {
                      quotation: {
                        quotation_grand_total: !isNaN(+search)
                          ? +search
                          : undefined,
                      },
                    },
                  ],
                },
              ]
            : []),
          ...(store_id
            ? [
                {
                  sales: {
                    store_id: {
                      in: store_id,
                    },
                  },
                },
              ]
            : []),
          ...(sales_id ? [{ sales_id: { equals: sales_id } }] : []),
          ...(status ? [{ status: { in: status } }] : []),
          ...(date_from && date_to
            ? [
                {
                  created_at: {
                    gte: new Date(date_from),
                    lte: new Date(`${date_to}T23:59:59.000Z`),
                  },
                },
              ]
            : []),
          {
            comission_sales_incentive_id: null,
          },
        ].filter(Boolean),
        // comission_sales_incentive: {
        //   deleted_at:{
        //     not: null
        //   }
        // },
        deleted_at: null,
      };

      const salesIncetive = await this.dbService.sales_incentive.findMany({
        where,
        skip,
        take: take > 0 ? take : undefined,
        orderBy: {
          created_at: 'desc',
        },
        include: {
          sales: {
            include: {
              store: true,
              bank: true,
            },
          },
          incentive: true,
          quotation: {
            include: {
              order: {
                include: {
                  store: true,
                  members: true,
                  status: true,
                },
              },
            },
          },
          comission_sales_incentive: true,
        },
      });
      const totalIncentive = await this.dbService.sales_incentive.aggregate({
        where,
        _sum: {
          nominal: true,
        },
      });

      const count = await this.dbService.sales_incentive.count({
        where,
      });

      return {
        data: salesIncetive,
        meta: {
          totalIncentive,
          page,
          take,
          total: count,
          takeTotal: salesIncetive.length,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async storeComissionReport(query: QueryParamsDto) {
    try {
      const { page, take, date_from, date_to, search } = query;
      const skip = page * take - take;
      const where: Prisma.incentive_storeWhereInput = {
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    {
                      store: {
                        store_name: search,
                      },
                    },
                  ],
                },
              ]
            : []),
        ].filter(Boolean),
        // comission_sales_incentive: {
        //   deleted_at:{
        //     not: null
        //   }
        // },
      };

      const salesIncetive = await this.dbService.incentive_store.findMany({
        where,
        skip,
        take: take > 0 ? take : undefined,

        include: {
          store: {
            include: {
              quotation: {
                where: {
                  order: {
                    created_at: {
                      gte: new Date(date_from),
                      lte: new Date(`${date_to}T23:59:59.000Z`),
                    },
                    status: {
                      category: 'WORKEND',
                    },
                  },
                },
              },
              // orders:{

              //   where:{
              //       created_at: {
              //         gte: new Date(date_from),
              //         lte: new Date(`${date_to}T23:59:59.000Z`),
              //       },
              //       status: {
              //         category: "WORKEND",
              //       },
              //   },
              //   include:{
              //     status:true,
              //     quotation:true
              //   }

              // }
            },
          },
          incentive: true,
        },
      });
      const salesIncetiveCount = await this.dbService.incentive_store.findMany({
        where,
        include: {
          store: {
            include: {
              quotation: {
                where: {
                  order: {
                    created_at: {
                      gte: new Date(date_from),
                      lte: new Date(`${date_to}T23:59:59.000Z`),
                    },
                    status: {
                      category: 'WORKEND',
                    },
                  },
                },
              },
              // orders:{

              //   where:{
              //       created_at: {
              //         gte: new Date(date_from),
              //         lte: new Date(`${date_to}T23:59:59.000Z`),
              //       },
              //       status: {
              //         category: "WORKEND",
              //       },
              //   },
              //   include:{
              //     status:true,
              //     quotation:true
              //   }

              // }
            },
          },
          incentive: true,
        },
      });
      const filteredSalesIncentive = salesIncetive.filter(
        (item) => item.store.quotation.length > 1,
      );
      const filteredSalesIncentiveCount = [];
      const storeSet = new Set();

      salesIncetiveCount.forEach((item) => {
        if (item.store.quotation.length > 1 && !storeSet.has(item.store.id)) {
          storeSet.add(item.store.id);
          filteredSalesIncentiveCount.push(item);
        }
      });

      // const totalIncentive = await this.dbService.sales_incentive.aggregate({
      //   where,
      //   _sum: {
      //     nominal: true,
      //   },
      // });
      return {
        data: filteredSalesIncentive,
        meta: {
          page,
          take,
          total: filteredSalesIncentiveCount.length,
          takeTotal: filteredSalesIncentive.length,
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
