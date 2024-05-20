import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateCsiDto } from './dto/create-csi.dto';
import { UpdateCsiDto } from './dto/update-csi.dto';
import { GoogleSheetConnectorService } from 'nest-google-sheet-connector';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CsiService {
  constructor(
    private readonly googleSheetConnectorService: GoogleSheetConnectorService,
    private readonly dbService: PrismaService,
  ) {}

  private readonly logger = new Logger(CsiService.name);

  async create(createCsiDto: CreateCsiDto) {
    const csi_data: Prisma.csi_templateCreateInput = createCsiDto;

    const [csi] = await this.dbService.$transaction([
      this.dbService.csi_template.create({
        data: csi_data,
      }),
    ]);

    return csi;
  }

  async findAll(query: QueryParamsDto) {
    const { take, page, search, status, date_from, date_to, order_by } = query;
    const total = await this.dbService.csi_template.count();
    const data = await this.dbService.csi_template.findMany({
      skip: page * take - take,
      take: take > 0 ? take : undefined,
      where: {
        AND: [
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
        ].filter(Boolean),
        deleted_at: null,
      },
      orderBy: {
        created_at: order_by,
      },
    });

    return {
      data,
      options: {
        total,
        page,
        take,
        takeTotal: data.length,
      },
    };
  }

  async findOne(id: number) {
    const data = await this.dbService.csi_template.findFirst({
      where: {
        id,
        deleted_at: null,
      },
      include: {
        csi_answers: {
          select: {
            id: true,
            data: true,
          },
        },
      },
    });

    if (!data) {
      throw new NotFoundException('CSI Not Found');
    }

    return data;
  }

  async update(id: number, updateCsiDto: UpdateCsiDto) {
    const data = await this.dbService.csi_template.update({
      where: {
        id,
      },
      data: updateCsiDto,
    });

    return data;
  }

  remove(id: number) {
    return `This action removes a #${id} csi`;
  }

  async fetchGFormAnswers(id: string) {
    const spreadsheetInstances =
      this.googleSheetConnectorService.getGoogleSheetConnect();

    const {
      data: { sheets },
    } = await spreadsheetInstances.spreadsheets.getByDataFilter({
      spreadsheetId: id,
    });

    const { properties } = sheets[0];

    const { data } = await spreadsheetInstances.spreadsheets.values.get({
      spreadsheetId: id,
      range: `A1:${this.numberToColumnLabel(
        properties.gridProperties.columnCount,
      )}${properties.gridProperties.rowCount}`,
    });
    const keys = data.values[0];
    const parsedData = data.values.slice(1).map((row, rindex) => {
      const obj = { Row: rindex + 1 };
      keys.forEach((key, index) => {
        obj[key] = row[index];
      });

      return obj;
    });

    return parsedData;
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async syncAnswer() {
    this.logger.verbose('Syncing CSI answers');

    const templates = await this.dbService.csi_template.findMany({
      where: {
        deleted_at: null,
        active: true,
      },
      include: {
        csi_answers: true,
      },
    });

    await Promise.all(
      templates.map(async (row) => {
        const { id, csi_answers, spreadsheets_link, name } = row;
        this.logger.log(`Fetching "${name}" template answer.`);

        const spreadsheetId = this.getSheetIdFromUrl(spreadsheets_link);
        const fetched_answers = await this.fetchGFormAnswers(spreadsheetId);

        const local_answer_ids = new Set(
          csi_answers.map((answer) => JSON.parse(answer.data)['Row']),
        );

        const filtered = fetched_answers.filter(
          (row) => !local_answer_ids.has(row['Row']),
        );

        if (filtered.length > 0) {
          this.logger.verbose(`Saving filtered answer (${filtered.length})...`);

          await this.storeAnswer(id, filtered);
        }

        this.logger.log(`Answer up to date`);
      }),
    );
  }

  async storeAnswer(templateId: number, data: object[]) {
    if (data.length > 0) {
      const saved = await this.dbService.csi_answers.createMany({
        data: data.map((row) => ({
          data: JSON.stringify(row),
          csi_template_id: templateId,
        })),
      });

      this.logger.log(`Saved ${saved.count} answers`);

      return;
    }
  }

  numberToColumnLabel(num: number) {
    let label = '';
    while (num > 0) {
      let remainder = (num - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      num = Math.floor((num - remainder) / 26);
    }
    return label;
  }

  getSheetIdFromUrl(url: string) {
    const regex = /spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const match = url.match(regex);

    if (match && match[1]) {
      return match[1];
    } else {
      return null; // or handle invalid URL as needed
    }
  }
}
