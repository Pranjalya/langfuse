import { prisma, Prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { organizationNameSchema } from "@/src/features/organizations/utils/organizationNameSchema";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod/v4";

const organizationIdQuerySchema = z.object({
  organizationId: z.string(),
});

const toJsonInput = (
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
};

const parseMetadataOrFail = (
  raw: unknown,
):
  | {
      ok: true;
      value:
        | Prisma.InputJsonValue
        | Prisma.NullableJsonNullValueInput
        | undefined;
    }
  | {
      ok: false;
      error: string;
    } => {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw !== null && typeof raw === "object")
    return { ok: true, value: toJsonInput(raw) };

  try {
    JSON.parse(String(raw));
    return { ok: true, value: toJsonInput(raw) };
  } catch (e) {
    return {
      ok: false,
      error: `Invalid metadata. Should be a valid JSON object: ${String(e)}`,
    };
  }
};

export const validateQueryAndExtractId = (query: unknown): string | null => {
  const parsed = organizationIdQuerySchema.safeParse(query);
  return parsed.success ? parsed.data.organizationId : null;
};

export async function handleGetOrganizationById(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const organizationId = validateQueryAndExtractId(req.query);
  if (!organizationId) {
    return res.status(400).json({ error: "Invalid organization ID" });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      metadata: true,
      projects: {
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!organization) {
    return res.status(404).json({ error: "Organization not found" });
  }

  return res.status(200).json({
    ...organization,
    metadata: organization.metadata ?? {},
    projects: organization.projects,
  });
}

export async function handleUpdateOrganization(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const organizationId = validateQueryAndExtractId(req.query);
  if (!organizationId) {
    return res.status(400).json({ error: "Invalid organization ID" });
  }

  const parsed = organizationNameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.format(),
    });
  }

  const metaResult = parseMetadataOrFail(
    (req.body as { metadata?: unknown })?.metadata,
  );
  if (!metaResult.ok) {
    return res.status(400).json({ message: metaResult.error });
  }

  const existing = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!existing) {
    return res.status(404).json({ error: "Organization not found" });
  }

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      name: parsed.data.name,
      metadata: metaResult.value,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      metadata: true,
      projects: {
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  await auditLog({
    resourceType: "organization",
    resourceId: organizationId,
    action: "update",
    orgId: organizationId,
    orgRole: "ADMIN",
    before: existing,
    after: updated,
    apiKeyId: "ADMIN_KEY",
  });

  logger.info(`Updated organization ${organizationId} via admin API`);

  return res.status(200).json({
    id: updated.id,
    name: updated.name,
    createdAt: updated.createdAt,
    metadata: updated.metadata ?? {},
    projects: updated.projects,
  });
}

export async function handleDeleteOrganization(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const organizationId = validateQueryAndExtractId(req.query);
  if (!organizationId) {
    return res.status(400).json({ error: "Invalid organization ID" });
  }

  const existing = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!existing) {
    return res.status(404).json({ error: "Organization not found" });
  }

  const activeProjects = await prisma.project.count({
    where: { orgId: organizationId, deletedAt: null },
  });

  const allProjects = await prisma.project.count({
    where: { orgId: organizationId },
  });

  if (activeProjects > 0) {
    return res.status(400).json({
      error: "Cannot delete organization with existing projects",
      message:
        "Please delete or transfer all projects before deleting the organization.",
    });
  }

  if (allProjects > 0) {
    return res.status(400).json({
      error: "Cannot delete organization with existing projects",
      message:
        "Deletion of your projects is still being processed, please try deleting the organization later",
    });
  }

  const deleted = await prisma.organization.delete({
    where: { id: organizationId },
  });

  await auditLog({
    resourceType: "organization",
    resourceId: organizationId,
    action: "delete",
    orgId: organizationId,
    orgRole: "ADMIN",
    before: deleted,
    apiKeyId: "ADMIN_KEY",
  });

  logger.info(`Deleted organization ${organizationId} via admin API`);

  return res.status(200).json({ success: true });
}
