import { prisma, Prisma } from "@langfuse/shared/src/db";
import { logger, type ApiAccessScope } from "@langfuse/shared/src/server";
import { type NextApiRequest, type NextApiResponse } from "next";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { projectRetentionSchema } from "@/src/features/auth/lib/projectRetentionSchema";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";

type CreateProjectBody = {
  name?: unknown;
  retention?: unknown;
  metadata?: unknown;
};

const isJsonObjectLike = (value: unknown): boolean =>
  value !== null && typeof value === "object";

const validateMetadataOrFail = (
  metadata: unknown,
): { ok: true } | { ok: false; message: string } => {
  if (metadata === undefined) return { ok: true };
  if (isJsonObjectLike(metadata)) return { ok: true };

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

export async function handleCreateProject(
  req: NextApiRequest,
  res: NextApiResponse,
  scope: ApiAccessScope,
) {
  try {
    const body = (req.body ?? {}) as CreateProjectBody;
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

    const existing = await prisma.project.findFirst({
      where: {
        orgId: scope.orgId,
        deletedAt: null,
        name: String(name),
      },
    });
    if (existing) {
      return res.status(409).json({
        message: "A project with this name already exists in your organization",
      });
    }

    const created = await prisma.project.create({
      data: {
        orgId: scope.orgId,
        name: String(name),
        retentionDays: retention as number | undefined,
        metadata: toJsonInput(metadata),
      },
      select: {
        id: true,
        name: true,
        metadata: true,
        retentionDays: true,
      },
    });

    return res.status(201).json({
      id: created.id,
      name: created.name,
      metadata: created.metadata ?? {},
      ...(created.retentionDays
        ? { retentionDays: created.retentionDays }
        : {}),
    });
  } catch (e) {
    logger.error("Failed to create project", e);
    return res.status(500).json({ message: "Internal server error" });
  }
}
