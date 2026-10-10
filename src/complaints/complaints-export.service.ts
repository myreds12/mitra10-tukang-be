/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ComplaintsExportService {
  async complaintExportExcel(res: Response, data: any[]) {
    try {

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Data Keluhan', {
        properties: {
          tabColor: { argb: 'FF00FF00' },
          outlineLevelCol: 2,
          outlineLevelRow: 40,
        },
        pageSetup: {
          margins: {
            left: 90.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3,
          },
        },
      });

      worksheet.columns = [
        { header: 'Compaint ID', key: 'id', width: 10 },
        { header: 'Order ID', key: 'order_id', width: 10 },
        { header: 'Complaint Melalui', key: 'complaint_channel', width: 20 },
        { header: 'Deskripsi', key: 'description', width: 40 },
        { header: 'Tanggal Complaint', key: 'complaint_date', width: 25 },
        { header: 'Nama Toko', key: 'store_name', width: 30 },
        { header: 'Nama Konsumen', key: 'member_name', width: 30 },
        { header: 'Nama Telepon Konsumen', key: 'phone_number', width: 30 },
        { header: 'Tanggal Order', key: 'order_create', width: 30 },
        { header: 'Umur Complaint', key: 'complaint_age', width: 20 },
        { header: 'Status Order', key: 'order_status', width: 30 },
        { header: 'Status Pengerjaan', key: 'work_status', width: 30 },
        { header: 'Status Complaint', key: 'complaint_status', width: 30 },
        { header: 'Feedback Name', key: 'feedback_name', width: 25 },
        { header: 'Feedback Role', key: 'feedback_role', width: 25 },
        { header: 'Complaint Dibuat', key: 'created_at', width: 25 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '0000FF' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      data.forEach((complaint) => {
        const formattedDateTime = (dateTime) =>
          `${new Date(dateTime).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}, ${dateTime.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;

        function calculateComplaintAge(complaintCreatedAt) {
          const complaintCreatedAtDate = new Date(complaintCreatedAt);
          if (isNaN(complaintCreatedAtDate.getTime())) {
            throw new Error('Invalid date for complaintCreatedAt');
          }

          const sevenDaysInMillis = 7 * 24 * 60 * 60 * 1000;
          const complaintCreatedAtWith7Days = new Date(
            complaintCreatedAtDate.getTime() + sevenDaysInMillis,
          );

          const now = new Date();

          const timeDiff =
            complaintCreatedAtWith7Days.getTime() - now.getTime();

          // console.log(timeDiff);
          // console.log(complaintCreatedAtWith7Days);
          const days = Math.floor(timeDiff / (24 * 60 * 60 * 1000));
          const hours = Math.floor(
            (timeDiff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000),
          );

          return `${days} hari, ${hours} jam`;
        }

        const complaintAge = calculateComplaintAge(complaint.created_at);

        const row = worksheet.addRow({
          id: complaint.id,
          order_id: complaint.order_id,
          complaint_channel: complaint.complaint_channels
            ? complaint.complaint_channels.name
            : 'N/a',
          description: complaint.description,
          complaint_date: formattedDateTime(complaint.complaint_date),
          store_name: complaint.orders.store.store_name,
          member_name: complaint.orders.members.full_name,
          phone_number:
            complaint?.orders?.members?.whatsapp_number ??
            complaint?.orders?.members?.whatsapp_number,
          order_create: formattedDateTime(complaint.orders.created_at),
          complaint_age: complaintAge,
          order_status: complaint.orders.status.description,
          work_status:
            complaint.orders?.work_orders?.status?.description || '-',
          complaint_status: complaint?.status?.description || '',
          feedback_name: complaint.feedback_name
            ? complaint.feedback_name
            : '-',
          feedback_role: complaint.feedback_role
            ? complaint.feedback_role
            : '-',
          created_at: formattedDateTime(complaint.created_at),
        });

        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      });

      const getFormattedDate = () => {
        const now = new Date();
        const tahun = now.getFullYear();
        const bulan = String(now.getMonth() + 1).padStart(2, '0');
        const tanggal = String(now.getDate()).padStart(2, '0');
        return `${tahun}-${bulan}-${tanggal}`;
      };

      const createExcelFilePath = (baseName: string) => {
        const folderPath = './storage/excel/complaint';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const now = Date.now();

        const excelFileName = `${baseName}-${now}.xlsx`;
        return path.join(folderPath, excelFileName);
      };

      const writeWorkbookAndSendResponse = async (
        workbook: exceljs.Workbook,
        excelFilePath: string,
        res: Response,
      ) => {
        await workbook.xlsx.writeFile(excelFilePath);

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=${path.basename(excelFilePath)}`,
        );

        const fileStream = fs.createReadStream(excelFilePath);
        fileStream.pipe(res);
      };

      const generateExcelFile = async (res) => {
        const formattedDate = getFormattedDate();
        const baseName = `DataKomplain-${formattedDate}`;
        const excelFilePath = createExcelFilePath(baseName);

        await writeWorkbookAndSendResponse(workbook, excelFilePath, res);
      };

      return generateExcelFile(res);
    } catch (error) {
      throw error;
    }
  }
}
