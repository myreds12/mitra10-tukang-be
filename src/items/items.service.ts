import { Injectable, HttpStatus } from '@nestjs/common';
import { UpdateDataDto } from './dto/update-item.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { DataDto } from './dto/create-item.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ItemsService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly dbService: PrismaService) { }
  async create(dataDto: DataDto, user_id: number) {
    try {
      const { unit, price, items } = dataDto
      let units
      let prices
      let item

      for (const u of unit) {
        units = await this.dbService.units.create({
          data: {
            ...u,
            created_by: user_id
          }
        })
      }

      for (const i of items) {
        item = await this.dbService.items.create({
          data: {
            item_name: i.item_name,
            created_by: user_id,
            units: {
              connect: {
                id: units.id
              }
            }
          }
        })
      }

      for (const p of price) {
        prices = await this.dbService.prices.create({
          data: {
            nominal_discount: p.nominal_discount,
            periodic_end: p.periodic_end,
            periodic_start: p.periodic_start,
            price: p.price,
            created_by: user_id,
            units: {
              connect: {
                id: units.id
              }
            },
            items: {
              connect: {
                id: item.id
              }
            }
          }
        })
      }
      this.eventEmitter.emit('create.logger', {
        module_id: item.id,
        module_type: 'items',
        issuer_id: user_id,
        issuer_type: 'users',
        properties: { properties: item, status: 'CREATE' },
      });
      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Create Data',
      };
    } catch (error) {
      console.log(error);

      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Create Data',
      };
    }
  }

  async findAll() {
    try {
      const items = await this.dbService.items.findMany({
        include: {
          prices: true,
          units: true
        }
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Get Data',
        data: items,
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Get Data',
      };
    }
  }

  async findOne(id: number) {
    try {
      const items = await this.dbService.items.findFirst({
        where: {
          id,
        },
        include: {
          prices: true,
          units: true
        }
      });

      return {
        status: HttpStatus.OK,
        message: 'Successfully to Find Data',
        data: items,
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Find Data',
      };
    }
  }

  async update(id: number, UpdateDataDto: UpdateDataDto, user_id: number) {
    try {
      const { unit, price, items } = UpdateDataDto
      let units
      let prices
      let item

      for (const u of unit) {
        units = await this.dbService.units.update({
          where: {
            id
          },
          data: {
            ...u,
            updated_by: user_id,
            updated_at: new Date
          }
        })
      }

      for (const i of items) {
        item = await this.dbService.items.update({
          where: {
            id
          },
          data: {
            item_name: i.item_name,
            updated_by: user_id,
            updated_at: new Date,
            units: {
              connect: {
                id: units.id
              }
            }
          }
        })
      }

      for (const p of price) {
        prices = await this.dbService.prices.update({
          where: {
            id
          },
          data: {
            nominal_discount: p.nominal_discount,
            periodic_end: p.periodic_end,
            periodic_start: p.periodic_start,
            price: p.price,
            updated_by: user_id,
            updated_at: new Date,
            units: {
              connect: {
                id: units.id
              }
            },
            items: {
              connect: {
                id: item.id
              }
            }
          }
        })
      }
      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Update Data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Update Data',
      };
    }
  }

  async remove(id: number, user_id: number) {
    try {
      const items = await this.dbService.items.findFirst({
        where: {
          id
        },
        include: {
          prices: true,
          units: true
        }
      })


      const item = await this.dbService.items.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id,
        },
      });

      const unit = await this.dbService.units.update({
        where: {
          id: item.unit_id
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id
        }
      })

      await this.dbService.prices.update({
        where: {
          id: items.prices[0].id
        },
        data: {
          deleted_at: new Date(),
          deleted_by: user_id
        }
      })

      return {
        status: HttpStatus.CREATED,
        message: 'Successfully to Delete Data',
      };
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Failed to Delete Data',
      };
    }
  }
}
