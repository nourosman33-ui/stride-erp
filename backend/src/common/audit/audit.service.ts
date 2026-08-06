import { Injectable } from "@nestjs/common";
import { Prisma, AuditAction } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface RecordAuditParams {
  entityType: string;
  entityId: string;
  action: AuditAction;
  performedById: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Writes to audit_log (SRS FR-USR-2 / NFR-2). Called explicitly from
 * service methods that mutate price, stock, expense-approval, PO-approval
 * or discount-approval records, rather than via generic interceptor magic —
 * this keeps before/after payloads meaningful per entity instead of
 * dumping raw request bodies.
 */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async record(params: RecordAuditParams): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        performedById: params.performedById,
        beforeValue:
          params.before === undefined
            ? Prisma.DbNull
            : (params.before as Prisma.InputJsonValue),
        afterValue:
          params.after === undefined
            ? Prisma.DbNull
            : (params.after as Prisma.InputJsonValue),
      },
    });
  }
}
