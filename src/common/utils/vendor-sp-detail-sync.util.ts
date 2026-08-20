/* eslint-disable prettier/prettier */
import { Prisma } from '@prisma/client';

/**
 * Options for `syncVendorSpDetails`.
 *
 * IMPORTANT: All fields are required. This utility does not assume defaults —
 * callers must pass in everything explicitly to avoid silent data drift.
 */
export interface SyncVendorSpDetailsOptions {
  /** vendor_sp.id (newly created or pre-existing) to attach logs to. */
  vendorSpId: number;
  /** vendor.id owning the violation logs in scope. */
  vendorId: number;
  /** Target quarter, 1..4. */
  quarter: number;
  /** Target year (e.g. 2026). */
  year: number;
  /** Auditor user id; null = system / scheduler trigger (no human actor). */
  createdBy: number | null;
}

/**
 * Result of a sync attempt, useful for logging and assertion in tests.
 */
export interface SyncVendorSpDetailsResult {
  /** Total number of `vendor_sp_detail` rows currently linked to this SP. */
  totalLinked: number;
  /** Number of NEW rows inserted in this invocation (0 if nothing new). */
  inserted: number;
}

/**
 * Link all active, non-deleted `vendor_violation_log` rows of a vendor in a
 * given quarter/year to an existing `vendor_sp` row, idempotently.
 *
 * DESIGN CONTRACT (atomicity):
 *   Must be called from inside a Prisma `$transaction(async (tx) => ...)`
 *   so that the SP creation/insertion and detail linking commit together.
 *
 * IDEMPOTENCY:
 *   - If a `vendor_sp_detail` row already exists for `(vendor_sp_id,
 *     violation_log_id)`, that log is skipped.
 *   - Running the function multiple times for the same SP never produces
 *     duplicate detail rows.
 *   - It also handles the "update-mode" case where new violations were
 *     recorded AFTER the SP was originally created — those are appended
 *     without touching existing links.
 *
 * SCOPE:
 *   Only considers `vendor_violation_log` with `deleted_at IS NULL` and
 *   `is_active = true` — same semantics as the rest of the violation
 *   pipeline so the detail never links to a soft-deleted or inactive log.
 *
 * @param tx  Prisma transaction client (from `$transaction(async (tx) => ...)`).
 * @param options See {@link SyncVendorSpDetailsOptions}.
 * @returns See {@link SyncVendorSpDetailsResult}.
 */
export async function syncVendorSpDetails(
  tx: Prisma.TransactionClient,
  options: SyncVendorSpDetailsOptions,
): Promise<SyncVendorSpDetailsResult> {
  const { vendorSpId, vendorId, quarter, year, createdBy } = options;

  // Step 1: collect violation_log_ids already linked to this SP.
  const alreadyLinked = await tx.vendor_sp_detail.findMany({
    where: { vendor_sp_id: vendorSpId },
    select: { violation_log_id: true },
  });
  const linkedSet = new Set<number>(alreadyLinked.map((d) => d.violation_log_id));

  // Step 2: fetch candidate logs (active, not soft-deleted) for the vendor
  //         in this quarter/year.
  const candidateLogs = await tx.vendor_violation_log.findMany({
    where: {
      vendor_id: vendorId,
      quarter,
      year,
      deleted_at: null,
      is_active: true,
    },
    select: { id: true },
  });

  // Step 3: diff — only insert logs that are not yet linked.
  const newLinks: Prisma.vendor_sp_detailCreateManyInput[] = candidateLogs
    .filter((log) => !linkedSet.has(log.id))
    .map((log) => ({
      vendor_sp_id: vendorSpId,
      violation_log_id: log.id,
      created_by: createdBy,
    }));

  if (newLinks.length > 0) {
    await tx.vendor_sp_detail.createMany({
      data: newLinks,
    });
  }

  return {
    totalLinked: linkedSet.size + newLinks.length,
    inserted: newLinks.length,
  };
}
