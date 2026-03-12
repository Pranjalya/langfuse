import { prisma, Prisma } from "@langfuse/shared/src/db";
import {
  logger,
  redis,
  QueueJobs,
  ProjectDeleteQueue,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { type NextApiRequest, type NextApiResponse } from "next";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { projectRetentionSchema } from "@/src/features/auth/lib/projectRetentionSchema";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { auditLog } from "@/src/features/audit-logs/auditLog";

type UpdateProjectBody = {
  name?: unknown;
  retention?: unknown;
  metadata?: unknown;
};

const validateMetadataOrFail = (
  metadata: unknown,
): { ok: true } | { ok: false; message: string } => {
  if (metadata === undefined) return { ok: true };
  if (metadata !== null && typeof metadata === "object") return { ok: true };

  try {
    JSON.parse(String(metadata));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: `Invalid metadata. Should be a valid JSON object: ${String(e)}`,
    };
  }
};

const toJsonInput = (
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
};

export async function handleUpdateProject(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  scope: ApiAccessScope,
) {
  try {
    const body = (req.body ?? {}) as UpdateProjectBody;
    const name = body.name;
    const retention = body.retention;
    const metadata = body.metadata;

    try {
      projectNameSchema.parse({ name });
    } catch {
      return res.status(400).json({
        message: "Invalid project name. Should be between 3 and 60 characters.",
      });
    }

    const metaValidation = validateMetadataOrFail(metadata);
    if (!metaValidation.ok) {
      return res.status(400).json({ message: metaValidation.message });
    }

    if (retention !== undefined) {
      try {
        projectRetentionSchema.parse({ retention });
      } catch {
        return res.status(400).json({
          message: "Invalid retention value. Must be 0 or at least 3 days.",
        });
      }
    }

    const updated = await prisma.project.update({
      where: { id: projectId, orgId: scope.orgId },
      data: {
        name: String(name),
        ...(retention !== undefined
          ? { retentionDays: retention as number }
          : {}),
        ...(metadata !== undefined ? { metadata: toJsonInput(metadata) } : {}),
      },
      select: { id: true, name: true, retentionDays: true, metadata: true },
    });

    return res.status(200).json({
      id: updated.id,
      name: updated.name,
      metadata: updated.metadata ?? {},
      ...(updated.retentionDays
        ? { retentionDays: updated.retentionDays }
        : {}),
    });
  } catch (e) {
    logger.error("Failed to update project", e);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function handleDeleteProject(
  _req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  scope: ApiAccessScope,
) {
  try {
    await new ApiAuthService(prisma, redis).invalidateCachedProjectApiKeys(
      projectId,
    );

    await prisma.apiKey.deleteMany({
      where: { projectId, scope: "PROJECT" },
    });

    const markedDeleted = await prisma.project.update({
      where: { id: projectId, orgId: scope.orgId },
      data: { deletedAt: new Date() },
    });

    await auditLog({
      apiKeyId: scope.apiKeyId,
      orgId: scope.orgId,
      projectId,
      resourceType: "project",
      resourceId: projectId,
      before: markedDeleted,
      action: "delete",
    });

    const queue = ProjectDeleteQueue.getInstance();
    if (!queue) {
      logger.error("ProjectDeleteQueue is not available");
      return res.status(500).json({ message: "Internal server error" });
    }

    await queue.add(QueueJobs.ProjectDelete, {
      timestamp: new Date(),
      id: randomUUID(),
      payload: { projectId, orgId: scope.orgId },
      name: QueueJobs.ProjectDelete,
    });

    return res.status(202).json({
      success: true,
      message:
        "Project deletion has been initiated and is being processed asynchronously",
    });
  } catch (e) {
    logger.error("Failed to delete project", e);
    return res.status(500).json({ message: "Internal server error" });
  }
}
