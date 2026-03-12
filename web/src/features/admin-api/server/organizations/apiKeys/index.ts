import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { z } from "zod/v4";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";

const organizationIdQuerySchema = z.object({
  organizationId: z.string(),
});

export const validateQueryAndExtractId = (query: unknown): string | null => {
  const parsed = organizationIdQuerySchema.safeParse(query);
  return parsed.success ? parsed.data.organizationId : null;
};

export async function handleGetApiKeys(
  _req: NextApiRequest,
  res: NextApiResponse,
  organizationId: string,
) {
  const apiKeys = await prisma.apiKey.findMany({
    where: { orgId: organizationId, scope: "ORGANIZATION" },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
      note: true,
      publicKey: true,
      displaySecretKey: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return res.status(200).json({ apiKeys });
}

export async function handleCreateApiKey(
  req: NextApiRequest,
  res: NextApiResponse,
  organizationId: string,
) {
  const bodySchema = z.object({ note: z.string().optional() });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.format(),
    });
  }

  const apiKeyMeta = await createAndAddApiKeysToDb({
    prisma,
    entityId: organizationId,
    note: parsed.data.note,
    scope: "ORGANIZATION",
  });

  await auditLog({
    resourceType: "apiKey",
    resourceId: apiKeyMeta.id,
    action: "create",
    orgId: organizationId,
    orgRole: "ADMIN",
    apiKeyId: "ADMIN_KEY",
  });

  logger.info(
    `Created API key ${apiKeyMeta.id} for organization ${organizationId} via admin API`,
  );

  return res.status(201).json(apiKeyMeta);
}
