import { Injectable } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { GoogleSheetConnectorService } from 'nest-google-sheet-connector';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { FormDto } from './dto/create-form.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly googleSheetConnectorService: GoogleSheetConnectorService,
    private readonly dbService: PrismaService,
    private readonly httpService : HttpService
  ) {}
  async create(createReportDto: CreateReportDto) {
    
  }
  //"1wLn20ycyAoKKyzZdSkoAfB2rPEjkTPG_ZWHzA6fVZaw"
  async findAll() {
   

  }

  findOne(id: number) {
    return `This action returns a #${id} report`;
  }

  update(id: number, updateReportDto: UpdateReportDto) {
    return `This action updates a #${id} report`;
  }

  remove(id: number) {
    return `This action removes a #${id} report`;
  }

  async createForm(dto: FormDto){
    const url = "https://forms.googleapis.com/v1/forms"
    const request = {
      "info": {
        "title": "Tukang",
        "description": ""
      },
      "items": [
        {
          "title": "ex1",
          "questionItem": {
            "question": {
              "required": false,
              "textQuestion": {
                "paragraph": false
              }
            }
          }
        }
      ]
    }

    const access_token = "https://www.googleapis.com/oauth2/v1/certs"

    const headers = {
      "Authorization": `Bearer ${access_token}`,
    };

    const response = await this.httpService.post(url, request, {headers})

    return response
  }
}
