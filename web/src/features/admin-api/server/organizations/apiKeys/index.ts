import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { prisma, ApiKeyScope } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server";

export const validateQueryAndExtractId = (query: NextApiRequest["query"]) => {
  if (
    !query.organizationId ||
    Array.isArray(query.organizationId) ||
    typeof query.organizationId !== "string"
  ) {
    return null;
  }
  return query.organizationId;
};

export const handleGetApiKeys = async (
  _req: NextApiRequest,
  res: NextApiResponse,
  organizationId: string,
) => {
  try {
    const apiKeys = await prisma.apiKey.findMany({
      where: { orgId: organizationId },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
        publicKey: true,
        displaySecretKey: true,
        note: true,
      },
    });

    return res.status(200).json(apiKeys);
  } catch (error) {
    console.error("Error fetching admin organization api keys", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const createApiKeySchema = z.object({
  note: z.string().optional(),
});

export const handleCreateApiKey = async (
  req: NextApiRequest,
  res: NextApiResponse,
  organizationId: string,
) => {
  const parsedBody = createApiKeySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsedBody.error,
    });
  }

  const { note } = parsedBody.data;

  try {
    const keys = await createAndAddApiKeysToDb({
      prisma,
      entityId: organizationId,
      note,
      scope: ApiKeyScope.ORGANIZATION,
    });

    await auditLog({
      userId: "admin-api",
      orgId: organizationId,
      resourceType: "apiKey",
      resourceId: keys.id,
      action: "create",
      after: { id: keys.id, note }, // Omit sensitive keys from audit
    });

    return res.status(201).json({
      id: keys.id,
      publicKey: keys.publicKey,
      secretKey: keys.secretKey, // only surface fully once
      displaySecretKey: keys.displaySecretKey,
      note: keys.note,
      createdAt: keys.createdAt,
    });
  } catch (error) {
    console.error("Error creating admin organization api key", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
