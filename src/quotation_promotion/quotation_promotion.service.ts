import { Injectable } from '@nestjs/common';
import { CreateQuotationPromotionDto } from './dto/create-quotation_promotion.dto';
import { UpdateQuotationPromotionDto } from './dto/update-quotation_promotion.dto';
import { Prisma, users } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';

@Injectable()
export class QuotationPromotionService {
  constructor(private readonly dbService: PrismaService) { }
  async create(createQuotationPromotionDto: CreateQuotationPromotionDto, quotation_promotion_evidences: Express.Multer.File[], user: users) {
    try {
      const { id: user_id } = user;
      const dto = createQuotationPromotionDto;
      const evidences = quotation_promotion_evidences.length > 0 ? quotation_promotion_evidences.map((x) => ({
        path: x.filename,
        created_by: user_id
      })) : [];

      const data: Prisma.quotation_promotionCreateInput = {
        quotation: {
          connect: {
            id: dto.quotation_id
          }
        },
        promotion_nominal: dto.promotion_nominal,
        description: dto.description,
        status: dto.status,
        quotation_promotion_evidences: {
          createMany: {
            data: evidences
          }
        },
        created_by: user_id
      }

      const [quotation_promotion] = await this.dbService.$transaction([
        this.dbService.quotation_promotion.create({
          data
        })
      ]);

      return quotation_promotion;
    } catch (error) {
      console.log(error);
      throw error
    }
  }


  async findAll(query: QueryParamsDto) {
    try {
      const { page, take, search, date_from, date_to, status } = query;
      const skip = page * take - take;

      const where: Prisma.quotation_promotionWhereInput = {
        AND: [
          ...(search ? [
            {
              OR: [
                {
                  id: !isNaN(+search) ? +search : undefined,
                },
                {
                  quotation_id: !isNaN(+search) ? +search : undefined,
                },
              ]
            }
          ] : []),
          ...(status ? [
            {
              status: {
                in: status
              }
            }
          ] : []),
          ...(date_from ? [
            {
              created_at: {
                gte: date_from
              }
            }
          ] : []),
          ...(date_to ? [
            {
              created_at: {
                lte: date_to
              }
            }
          ] : [])
        ]
      };
      const total = await this.dbService.quotation_promotion.count({
        where
      });

      const data = await this.dbService.quotation_promotion.findMany({
        where,
        skip,
        take: take <= 0 ? undefined : take,
        orderBy: {
          created_at: 'desc',
        },
        include: {
          quotation: {
            include: {
              promotion: {
                where: {
                  deleted_at: null
                }
              },
              quotation_receipt: {
                where: {
                  deleted_at: null
                }
              },
              order: {
                include: {
                  m_order_details: {
                    where: {
                      deleted_at: null
                    }
                  }
                }
              }
            }
          }
        }
      });
      const userIds = [
        ...new Set(
          data
            .flatMap((item) => [
              item.created_by,
              item.updated_by,
              item.deleted_by,
            ])
            .filter(Boolean),
        ),
      ];

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

      const userMap = users.reduce(
        (acc, user) => ({
          ...acc,
          [user.id]: user,
        }),
        {},
      );

      const quotationPromotionWithUser = data.map((item) => ({
        ...item,
        created_by: item.created_by ? userMap[item.created_by] || null : null,
        updated_by: item.updated_by ? userMap[item.updated_by] || null : null,
        deleted_by: item.deleted_by ? userMap[item.deleted_by] || null : null,
      }));

      return {
        data: quotationPromotionWithUser,
        meta: {
          skip,
          take,
          page,
          takeTotal: data.length,
          total,
        },
      }
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const data = await this.dbService.quotation_promotion.findFirst({
        where: {
          id
        },
        include: {
          quotation: {
            include: {
              promotion: {
                where: {
                  deleted_at: null
                }
              },
              quotation_receipt: {
                where: {
                  deleted_at: null
                }
              },
              order: {
                include: {
                  m_order_details: {
                    where: {
                      deleted_at: null
                    }
                  }
                }
              }
            }
          },
          quotation_promotion_evidences: {
            where: {
              deleted_at: null
            }
          }
        }
      });
      const userIds = [
        data.created_by,
        data.updated_by,
        data.deleted_by,
      ].filter(Boolean);

      const users = await this.dbService.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });

      const userMap = Object.fromEntries(users.map((user) => [user.id, user]));

      const quotationPromotionWithUser = {
        ...data,
        created_by: userMap[data.created_by] || null,
        updated_by: userMap[data.updated_by] || null,
        deleted_by: userMap[data.deleted_by] || null,
      };

      return quotationPromotionWithUser;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async update(id: number, updateQuotationPromotionDto: UpdateQuotationPromotionDto, quotation_promotion_evidences: Express.Multer.File[], user: users) {
    try{
      const {id: user_id} = user;
      const dto = updateQuotationPromotionDto;
      const evidences = quotation_promotion_evidences.length > 0 ? quotation_promotion_evidences.map((x) => ({
        path: x.filename,
        created_by: user_id,
      })) : [];

      const data : Prisma.quotation_promotionUpdateArgs = {
        where: {
          id
        },
        data: {
          quotation_id: dto.quotation_id ?? undefined,
          description: dto.description ?? undefined,
          promotion_nominal: dto.promotion_nominal ?? undefined,
          status: dto.status ?? undefined,
          quotation_promotion_evidences: evidences.length > 0 ?{
            createMany: {
              data: evidences
            }
          } : undefined,
          updated_at: new Date(),
          updated_by: user_id
        }
      };

      const [syncFiles, quotationPromotion] = await this.dbService.$transaction([
        this.dbService.quotation_promotion_evidences.deleteMany({
          where: {
            quotation_promotion_id: id
          }
        }),
        this.dbService.quotation_promotion.update(data),
      ])

      return quotationPromotion;
    }catch(error){
      console.log(error)
      throw error;
    }
  }

  async nextCode(){
    try {
      const quotationPromotion = await this.dbService.quotation_promotion.findMany({
        orderBy: {
          id: 'desc',
        },
        take: 1,
      });

      return quotationPromotion[0] || null;
    } catch (error) {
      console.error(error);

      throw error;
    }
  }

  async remove(id: number, user: users) {
    try{
      const data = await this.dbService.quotation_promotion.update({
        where: {
          id
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user.id
        }
      })
      return data
    }catch(error){
      console.log(error);
      throw error;
    }
  }
}
