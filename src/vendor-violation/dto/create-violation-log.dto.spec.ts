import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateViolationLogDto } from './create-violation-log.dto';

/**
 * [POIN 6] DTO validation tests — verify evidence_path jadi required
 * (Lapis 3 UI guard). Sebelumnya optional, sekarang WAJIB diisi.
 */
describe('CreateViolationLogDto — POIN 6 evidence_path wajib', () => {
  const baseValid = {
    vendor_id: 1,
    violation_type_id: 1,
    order_id: 100,
    description: 'test',
    evidence_path: '/uploads/evidence/refund-foto-12345.png',
  };

  const validateDto = (data: Partial) => {
    const dto = plainToInstance(CreateViolationLogDto, data);
    return validate(dto);
  };

  it('DENGAN evidence_path → tidak ada error validasi', async () => {
    const errors = await validateDto(baseValid);
    expect(errors).toHaveLength(0);
  });

  it('TANPA evidence_path → ada error validasi (Lapis 3 UI guard)', async () => {
    const { evidence_path: _, ...withoutEvidence } = baseValid;
    const errors = await validateDto(withoutEvidence);
    expect(errors.length).toBeGreaterThan(0);
    const evidenceError = errors.find((e) => e.property === 'evidence_path');
    expect(evidenceError).toBeDefined();
    expect(evidenceError?.constraints).toHaveProperty('isNotEmpty');
  });

  it('evidence_path empty string → ada error validasi', async () => {
    const errors = await validateDto({ ...baseValid, evidence_path: '' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'evidence_path')).toBe(true);
  });
});