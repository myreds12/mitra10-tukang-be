/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTermsAndConditionsDto } from './dto/vendor-registration.dto';
import { writeFileSync } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';
import { VendorRegistrationValidationService } from './vendor-registration-validation.service';

@Injectable()
export class VendorTermsService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly validationService: VendorRegistrationValidationService,
  ) {}
  async getActiveTermsAndConditions() {
    const terms = await this.dbService.vendor_terms_and_conditions.findFirst({
      where: { is_active: true, deleted_at: null },
    });

    if (!terms) {
      throw new NotFoundException(
        'Dokumen Syarat & Ketentuan belum tersedia. Silakan hubungi Admin Mitra10.',
      );
    }

    return {
      id: terms.id,
      title: terms.title,
      document_type: terms.document_type, // HTML | PDF
      // Konten HTML hanya dikirim untuk tipe HTML. Tipe PDF: konten dilayani
      // terpisah via GET /terms-and-conditions/file (streaming read-only).
      content: terms.document_type === 'HTML' ? terms.content : null,
      version: terms.version,
      updated_at: terms.updated_at ?? terms.created_at,
    };
  }

  // [ADMIN HO / SUPER USER] Riwayat semua versi T&C (untuk halaman setting).
  async listTermsAndConditions(userId: number) {
    await this.validationService.assertAdminHOOrSuperUser(userId);

    const termsList = await this.dbService.vendor_terms_and_conditions.findMany({
      where: { deleted_at: null },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        title: true,
        version: true,
        is_active: true,
        document_type: true,
        created_at: true,
        updated_at: true,
      },
    });

    return { data: termsList, total: termsList.length };
  }

  // [ADMIN HO / SUPER USER] Detail satu versi T&C by id (untuk form edit versi arsip).
  async getTermsVersionById(id: number, userId: number) {
    await this.validationService.assertAdminHOOrSuperUser(userId);

    const terms = await this.dbService.vendor_terms_and_conditions.findFirst({
      where: { id, deleted_at: null },
    });

    if (!terms) {
      throw new NotFoundException(`Versi Syarat & Ketentuan dengan ID ${id} tidak ditemukan.`);
    }

    return {
      id: terms.id,
      title: terms.title,
      document_type: terms.document_type,
      content: terms.document_type === 'HTML' ? terms.content : null,
      file_path: terms.file_path,
      version: terms.version,
      is_active: terms.is_active,
      created_at: terms.created_at,
      updated_at: terms.updated_at,
    };
  }

  // [ADMIN HO / SUPER USER] Update isi T&C tanpa redeploy. Mendukung HTML (Quill)
  // maupun PDF (upload file). Single-active: versi baru otomatis jadi SATU-satunya
  // versi aktif (versi lama dinonaktifkan dalam transaction yang sama).
  async updateTermsAndConditions(
    dto: UpdateTermsAndConditionsDto,
    userId: number,
    file?: Express.Multer.File,
  ) {
    await this.validationService.assertAdminHOOrSuperUser(userId);

    const documentType = dto.document_type === 'PDF' ? 'PDF' : 'HTML';

    // Validasi per tipe dokumen
    if (documentType === 'PDF') {
      if (!file) {
        throw new BadRequestException(
          'File PDF wajib diunggah untuk dokumen tipe PDF.',
        );
      }
      if (!file.mimetype || file.mimetype !== 'application/pdf') {
        throw new BadRequestException('File harus berformat PDF (application/pdf).');
      }
    } else {
      const plainContent = (dto.content ?? '').replace(/<[^>]*>/g, '').trim();
      if (!plainContent) {
        throw new BadRequestException(
          'Konten T&C (HTML) wajib diisi untuk dokumen tipe HTML.',
        );
      }
    }

    let pdfPath: string | null = null;
    if (documentType === 'PDF' && file) {
      pdfPath = this.saveTermsFile(file);
    }

    const created = await this.dbService.$transaction(async (tx) => {
      const current = await tx.vendor_terms_and_conditions.findFirst({
        where: { is_active: true, deleted_at: null },
      });

      // Single-active: nonaktifkan SEMUA versi aktif dalam transaction yang sama.
      if (current) {
        await tx.vendor_terms_and_conditions.updateMany({
          where: { is_active: true, deleted_at: null },
          data: {
            is_active: false,
            updated_at: new Date(),
            updated_by: userId,
          },
        });
      }

      return tx.vendor_terms_and_conditions.create({
        data: {
          title: dto.title.trim(),
          content: documentType === 'HTML' ? dto.content ?? '' : '',
          document_type: documentType,
          file_path: pdfPath,
          version: (current?.version ?? 0) + 1,
          is_active: true,
          created_by: userId,
        },
      });
    });

    return {
      message: 'Syarat & Ketentuan berhasil diperbarui.',
      id: created.id,
      version: created.version,
      document_type: created.document_type,
    };
  }

  // [ADMIN HO / SUPER USER] Edit IN-PLACE satu versi T&C yang sudah ada.
  // Tidak membuat versi baru — hanya update konten (title/content/file) dari
  // versi yang dimaksud. Cocok untuk memperbaiki typo tanpa menambah baris
  // baru di audit trail. Single-active TETAP berlaku karena is_active TIDAK
  // diubah: edit versi aktif → tetap aktif; edit versi arsip → tetap arsip.
  async editTermsVersionInPlace(
    id: number,
    dto: UpdateTermsAndConditionsDto,
    userId: number,
    file?: Express.Multer.File,
  ) {
    await this.validationService.assertAdminHOOrSuperUser(userId);

    const existing = await this.dbService.vendor_terms_and_conditions.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException(
        `Versi Syarat & Ketentuan dengan ID ${id} tidak ditemukan.`,
      );
    }

    const documentType = dto.document_type === 'PDF' ? 'PDF' : 'HTML';

    if (documentType === 'PDF') {
      if (!file && !existing.file_path) {
        throw new BadRequestException(
          'File PDF wajib diunggah untuk dokumen tipe PDF.',
        );
      }
      if (file && (!file.mimetype || file.mimetype !== 'application/pdf')) {
        throw new BadRequestException(
          'File harus berformat PDF (application/pdf).',
        );
      }
    } else {
      const plainContent = (dto.content ?? '').replace(/<[^>]*>/g, '').trim();
      if (!plainContent) {
        throw new BadRequestException(
          'Konten T&C (HTML) wajib diisi untuk dokumen tipe HTML.',
        );
      }
    }

    let pdfPath: string | null = existing.file_path;
    if (documentType === 'PDF' && file) {
      pdfPath = this.saveTermsFile(file);
    }

    const updated = await this.dbService.vendor_terms_and_conditions.update({
      where: { id },
      data: {
        title: dto.title.trim(),
        content: documentType === 'HTML' ? dto.content ?? '' : '',
        document_type: documentType,
        file_path: pdfPath,
        updated_at: new Date(),
        updated_by: userId,
      },
    });

    return {
      message: `Versi v${updated.version} berhasil diperbarui (in-place).`,
      id: updated.id,
      version: updated.version,
      document_type: updated.document_type,
      is_active: updated.is_active,
    };
  }

  // [ADMIN HO / SUPER USER] Aktivasi satu versi T&C.
  // Single-active: semua versi lain otomatis dinonaktifkan dalam transaction.
  async activateTermsVersion(id: number, userId: number) {
    await this.validationService.assertAdminHOOrSuperUser(userId);

    return this.dbService.$transaction(async (tx) => {
      const terms = await tx.vendor_terms_and_conditions.findFirst({
        where: { id, deleted_at: null },
      });

      if (!terms) {
        throw new NotFoundException(
          `Versi Syarat & Ketentuan dengan ID ${id} tidak ditemukan.`,
        );
      }

      if (terms.is_active) {
        throw new BadRequestException(
          `Versi v${terms.version} sudah aktif. Hanya satu versi yang boleh aktif.`,
        );
      }

      await tx.vendor_terms_and_conditions.updateMany({
        where: { is_active: true, deleted_at: null },
        data: {
          is_active: false,
          updated_at: new Date(),
          updated_by: userId,
        },
      });

      await tx.vendor_terms_and_conditions.update({
        where: { id },
        data: {
          is_active: true,
          updated_at: new Date(),
          updated_by: userId,
        },
      });

      return {
        message: `Versi v${terms.version} berhasil diaktifkan (versi lain dinonaktifkan).`,
        id,
        version: terms.version,
      };
    });
  }

  // [ADMIN HO / SUPER USER] Nonaktifkan versi T&C.
  // Validasi: tidak boleh menonaktifkan jika ini SATU-satunya versi aktif
  // (harus selalu ada minimal 1 T&C aktif untuk halaman login/pendaftar).
  async deactivateTermsVersion(id: number, userId: number) {
    await this.validationService.assertAdminHOOrSuperUser(userId);

    return this.dbService.$transaction(async (tx) => {
      const terms = await tx.vendor_terms_and_conditions.findFirst({
        where: { id, deleted_at: null },
      });

      if (!terms) {
        throw new NotFoundException(
          `Versi Syarat & Ketentuan dengan ID ${id} tidak ditemukan.`,
        );
      }

      if (!terms.is_active) {
        throw new BadRequestException(`Versi v${terms.version} memang sudah tidak aktif.`);
      }

      // Validasi single-active invariant: minimal 1 harus tetap aktif.
      const activeCount = await tx.vendor_terms_and_conditions.count({
        where: { is_active: true, deleted_at: null },
      });

      if (activeCount <= 1) {
        throw new BadRequestException(
          'Tidak bisa menonaktifkan satu-satunya T&C aktif. Aktifkan versi lain terlebih dahulu.',
        );
      }

      await tx.vendor_terms_and_conditions.update({
        where: { id },
        data: {
          is_active: false,
          updated_at: new Date(),
          updated_by: userId,
        },
      });

      return {
        message: `Versi v${terms.version} berhasil dinonaktifkan.`,
        id,
        version: terms.version,
      };
    });
  }

  // [PUBLIC] Path absolut file PDF T&C aktif (untuk controller streaming read-only).
  // Dipanggil controller -> validasi file -> stream ke response TANPA Content-Disposition
  // attachment (browser tidak menawarkan download; viewer inline saja).
  async getActiveTermsPdfPath(): Promise<{ title: string; absolutePath: string } | null> {
    const terms = await this.dbService.vendor_terms_and_conditions.findFirst({
      where: { is_active: true, deleted_at: null, document_type: 'PDF' },
    });

    if (!terms?.file_path) return null;

    const absolutePath = this.resolveTermsFilePath(terms.file_path);
    return { title: terms.title, absolutePath };
  }

  // Simpan file PDF T&C ke folder storage (pattern sama dengan saveFile vendor docs).
  private saveTermsFile(file: Express.Multer.File): string {
    const uploadDir = resolveUploadPath('terms');
    const fileName = `terms-${Date.now()}.pdf`;
    const filePath = join(uploadDir, fileName);
    writeFileSync(filePath, file.buffer as any);
    return `uploads/terms/${fileName}`;
  }

  // Resolve path relatif -> absolut dengan guard path traversal.
  private resolveTermsFilePath(storedPath: string): string {
    const uploadRoot = resolveUploadPath();
    const normalized = storedPath.replace(/^[/\\]+/, '').replace(/^uploads[/\\]/, '');
    const absolutePath = resolve(uploadRoot, normalized);
    const relativePath = relative(uploadRoot, absolutePath);

    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new BadRequestException('Path file T&C tidak valid.');
    }

    return absolutePath;
  }

  // ================================
  // REGISTRANT (PENDAFTAR) DASHBOARD
  // ================================

  // [REGISTRANT] Daftar pendaftaran milik user yang login (ownership via user_id).

}
