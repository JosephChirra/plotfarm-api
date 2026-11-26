import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

export type SchemaReadinessIssue = {
  code:
    | "db_unreachable"
    | "missing_column"
    | "missing_enum_value"
    | "missing_table"
    | "unknown_error";
  message: string;
  details?: Record<string, unknown>;
};

export type SchemaReadinessReport = {
  ok: boolean;
  checkedAt: string;
  issues: SchemaReadinessIssue[];
};

@Injectable()
export class SchemaReadinessService {
  private readonly logger = new Logger(SchemaReadinessService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async columnExists(table: string, column: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${table}
          AND column_name = ${column}
      ) AS "exists"
    `;
    return rows?.[0]?.exists === true;
  }

  private async tableExists(table: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ${table}
      ) AS "exists"
    `;
    return rows?.[0]?.exists === true;
  }

  private async enumValueExists(enumName: string, value: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = ${enumName}
          AND e.enumlabel = ${value}
      ) AS "exists"
    `;
    return rows?.[0]?.exists === true;
  }

  async check(): Promise<SchemaReadinessReport> {
    const checkedAt = new Date().toISOString();
    const issues: SchemaReadinessIssue[] = [];

    try {
      // 1) Core tables that must exist for credit flows.
      const creditConfigExists = await this.tableExists("CreditConfig");
      if (!creditConfigExists) {
        issues.push({
          code: "missing_table",
          message: 'Missing table "CreditConfig" (database not migrated?)',
        });
        return { ok: false, checkedAt, issues };
      }

      const creditTxnExists = await this.tableExists("CreditTransaction");
      if (!creditTxnExists) {
        issues.push({
          code: "missing_table",
          message: 'Missing table "CreditTransaction" (database not migrated?)',
        });
        return { ok: false, checkedAt, issues };
      }

      // 2) New compatibility-window columns we rely on.
      const postCostCredits = await this.columnExists("CreditConfig", "postCostCredits");
      if (!postCostCredits) {
        issues.push({
          code: "missing_column",
          message: 'Missing column "CreditConfig.postCostCredits" (apply migration 20260416090000_post_credit_compat)',
        });
      }

      const postVisibilityDays = await this.columnExists("CreditConfig", "postVisibilityDays");
      if (!postVisibilityDays) {
        issues.push({
          code: "missing_column",
          message:
            'Missing column "CreditConfig.postVisibilityDays" (apply migration 20260416090000_post_credit_compat)',
        });
      }

      // 3) Enum values for safe credit writes.
      const postSpend = await this.enumValueExists("CreditTransactionType", "POST_SPEND");
      if (!postSpend) {
        issues.push({
          code: "missing_enum_value",
          message:
            'Missing enum value CreditTransactionType.POST_SPEND (apply migration 20260416090000_post_credit_compat)',
        });
      }

      const postRefund = await this.enumValueExists("CreditTransactionType", "POST_REFUND");
      if (!postRefund) {
        issues.push({
          code: "missing_enum_value",
          message:
            'Missing enum value CreditTransactionType.POST_REFUND (apply migration 20260416090000_post_credit_compat)',
        });
      }

      return { ok: issues.length === 0, checkedAt, issues };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Schema readiness check failed: ${msg}`);
      issues.push({
        code: msg.toLowerCase().includes("connect") ? "db_unreachable" : "unknown_error",
        message: "Failed to validate DB schema readiness",
        details: { error: msg },
      });
      return { ok: false, checkedAt, issues };
    }
  }
}

