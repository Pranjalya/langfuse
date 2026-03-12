import { prisma, Prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { organizationNameSchema } from "@/src/features/organizations/utils/organizationNameSchema";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { type NextApiRequest, type NextApiResponse } from "next";

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

export async function handleGetOrganizations(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  const organizations = await prisma.organization.findMany({
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

  return res.status(200).json({
    organizations: organizations.map((org) => ({
      ...org,
      metadata: org.metadata ?? {},
      projects: org.projects,
    })),
  });
}

export async function handleCreateOrganization(
  req: NextApiRequest,
  res: NextApiResponse,
) {
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

  const created = await prisma.organization.create({
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
    resourceId: created.id,
    action: "create",
    orgId: created.id,
    orgRole: "ADMIN",
    after: created,
    apiKeyId: "ADMIN_KEY",
  });

  logger.info(`Created organization ${created.id} via admin API`);

  return res.status(201).json({
    id: created.id,
    name: created.name,
    createdAt: created.createdAt,
    metadata: created.metadata ?? {},
    projects: created.projects,
  });
}
