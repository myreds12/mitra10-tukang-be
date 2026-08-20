/* eslint-disable prettier/prettier */
/**
 * Backfill script: populate `vendor_sp_detail` rows for historical
 * `vendor_sp` records that were created before the issueSP() fix was
 * deployed (i.e. SP rows whose detail rows are missing because production
 * code used to skip the insert).
 *
 * Usage:
 *   ts-node prisma/scripts/backfill-vendor-sp-detail.ts --dry-run
 *   ts-node prisma/scripts/backfill-vendor-sp-detail.ts --execute
 *
 * --dry-run  (default) — scan + log planned inserts; no writes.
 * --execute            — actually insert. Idempotent (safe to re-run).
 *
 * Persistent audit log:
 *   Every run (dry-run AND execute) writes to
 *     ./storage/logs/backfill-vendor-sp-detail-<ISO-timestamp>.log
 *   containing the plan, executed operations, and lists of skipped IDs.
 *   `created_by` on the inserted rows remains NULL — the log file is the
 *   permanent audit trail of which SPs were touched by which backfill.
 *
 * Notes:
 *  - Reads `MSSQL_URL` from process env (.env), same as other scripts.
 *  - For each SP with no detail row, finds `vendor_violation_log` rows in
 *    the same (vendor_id, quarter, year) with `deleted_at IS NULL` and
 *    links them all.
 *  - Preserves `created_at` of the original SP via raw SQL (Prisma
 *    createMany doesn't accept per-row timestamps).
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

type Mode = 'dry-run' | 'execute';

function detectMode(): Mode {
  const flag = process.argv.find((a) => a === '--execute' || a === '--dry-run');
  if (flag === '--execute') return 'execute';
  return 'dry-run';
}

const prisma = new PrismaClient();

interface PlanRow {
  vendorSpId: number;
  vendorId: number;
  quarter: number;
  year: number;
  candidateLogIds: number[];
  vendorSpCreatedAt: Date;
}

async function plan(): Promise<{ rows: PlanRow[] }> {
  const allSps = await prisma.vendor_sp.findMany({
    where: { deleted_at: null },
    select: {
      id: true,
      vendor_id: true,
      quarter: true,
      year: true,
      created_at: true,
      sp_details: { select: { id: true }, take: 1 },
    },
  });

  const spIdsWithDetail = new Set<number>(
    await prisma.vendor_sp_detail
      .findMany({ select: { vendor_sp_id: true } })
      .then((rows) => rows.map((r) => r.vendor_sp_id)),
  );

  const rows: PlanRow[] = [];
  for (const sp of allSps) {
    if (sp.sp_details.length > 0 || spIdsWithDetail.has(sp.id)) continue;
    const logs = await prisma.vendor_violation_log.findMany({
      where: {
        vendor_id: sp.vendor_id,
        quarter: sp.quarter,
        year: sp.year,
        deleted_at: null,
        is_active: true,
      },
      select: { id: true },
    });
    rows.push({
      vendorSpId: sp.id,
      vendorId: sp.vendor_id,
      quarter: sp.quarter,
      year: sp.year,
      candidateLogIds: logs.map((l) => l.id),
      vendorSpCreatedAt: sp.created_at,
    });
  }
  return { rows };
}

async function execute(rows: PlanRow[]) {
  let totalInserted = 0;
  let totalSpsTouched = 0;
  let totalSkipped = 0;

  for (const row of rows) {
    if (row.candidateLogIds.length === 0) {
      totalSkipped++;
      continue;
    }
    const values = row.candidateLogIds
      .map(
        (logId) =>
          `(${row.vendorSpId}, ${logId}, NULL, '${row.vendorSpCreatedAt.toISOString()}')`,
      )
      .join(', ');
    await prisma.$executeRawUnsafe(`
      INSERT INTO vendor_sp_detail (vendor_sp_id, violation_log_id, created_by, created_at)
      VALUES ${values}
    `);
    totalInserted += row.candidateLogIds.length;
    totalSpsTouched++;
  }
  return { totalInserted, totalSpsTouched, totalSkipped };
}

function setupLogFile(mode: Mode): {
  path: string;
  append: (line: string) => void;
} {
  const logsDir = resolve(process.cwd(), 'storage', 'logs');
  mkdirSync(logsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = resolve(
    logsDir,
    `backfill-vendor-sp-detail-${stamp}.log`,
  );
  writeFileSync(
    logPath,
    [
      `# backfill-vendor-sp-detail audit log`,
      `started_at=${new Date().toISOString()}`,
      `mode=${mode}`,
      '',
    ].join('\n'),
    'utf8',
  );
  const append = (line: string): void => {
    appendFileSync(logPath, line + '\n', 'utf8');
  };
  return { path: logPath, append };
}

function logHeader(mode: Mode) {
  const sep = '='.repeat(70);
  console.log(sep);
  console.log(`backfill-vendor-sp-detail :: mode=${mode}`);
  console.log(`started_at=${new Date().toISOString()}`);
  console.log(sep);
}

function logPlan(
  rows: PlanRow[],
  append: (line: string) => void,
): { withLogs: number; withoutLogs: number } {
  let withLogs = 0;
  let withoutLogs = 0;
  for (const r of rows) {
    if (r.candidateLogIds.length === 0) withoutLogs++;
    else withLogs++;
  }
  console.log(`Scanned SP candidates (no detail rows): ${rows.length}`);
  console.log(`  - will insert details : ${withLogs}`);
  console.log(`  - will be skipped (no matching logs) : ${withoutLogs}`);
  append(`scanned_candidates=${rows.length}`);
  append(`will_insert=${withLogs}`);
  append(`will_skip=${withoutLogs}`);
  append(`--- plan ---`);
  for (const r of rows) {
    if (r.candidateLogIds.length > 0) {
      append(
        `INSERT vendor_sp_id=${r.vendorSpId} vendor=${r.vendorId} Q${r.quarter}/${r.year} detail_rows=${r.candidateLogIds.length} original_sp_created_at=${r.vendorSpCreatedAt.toISOString()}`,
      );
    } else {
      append(
        `SKIP vendor_sp_id=${r.vendorSpId} vendor=${r.vendorId} Q${r.quarter}/${r.year} reason=no_matching_violation_log`,
      );
    }
  }
  return { withLogs, withoutLogs };
}

async function run() {
  const mode = detectMode();
  const { path: logPath, append } = setupLogFile(mode);
  logHeader(mode);
  console.log(`audit_log=${logPath}`);
  append(`audit_log=${logPath}`);

  const { rows } = await plan();
  logPlan(rows, append);

  if (mode === 'dry-run') {
    append(``);
    append(`mode=dry-run no_db_writes=true`);
    append(`finished_at=${new Date().toISOString()}`);
    console.log('--dry-run: no database writes performed. Re-run with --execute to apply.');
    return;
  }

  if (process.env.BACKFILL_CONFIRM !== 'YES') {
    console.log('Refusing to execute without BACKFILL_CONFIRM=YES env var.');
    console.log('Re-run with: BACKFILL_CONFIRM=YES npx ts-node prisma/scripts/backfill-vendor-sp-detail.ts --execute');
    append(`mode=execute ABORTED reason=BACKFILL_CONFIRM env var missing`);
    process.exitCode = 2;
    return;
  }

  append(``);
  append(`mode=execute starting_db_writes`);
  const { totalInserted, totalSpsTouched, totalSkipped } = await execute(rows);

  console.log(''.padEnd(70, '='));
  console.log(`Inserted vendor_sp_detail rows : ${totalInserted}`);
  console.log(`SPs touched                     : ${totalSpsTouched}`);
  console.log(`SPs skipped (no matching logs)  : ${totalSkipped}`);
  console.log(`finished_at=${new Date().toISOString()}`);

  append(``);
  append(`inserted_rows=${totalInserted}`);
  append(`sp_touched=${totalSpsTouched}`);
  append(`sp_skipped=${totalSkipped}`);
  append(`finished_at=${new Date().toISOString()}`);
  append(`note=created_by=NULL on all inserted rows; this file is the audit trail`);
}

run()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
