import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { z } from "zod/v4";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";

const projectIdQuerySchema = z.object({
  projectId: z.string(),
});

export const validateQueryAndExtractId = (query: unknown): string | null => {
  const parsed = projectIdQuerySchema.safeParse(query);
  return parsed.success ? parsed.data.projectId : null;
};

export async function handleGetApiKeys(
  _req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
) {
  const apiKeys = await prisma.apiKey.findMany({
    where: { projectId, scope: "PROJECT" },
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
  projectId: string,
  orgId: string,
) {
  const bodySchema = z.object({
    note: z.string().optional(),
    publicKey: z.string().optional(),
    secretKey: z.string().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid request body",
      details: parsed.error.format(),
    });
  }

  const { note, publicKey, secretKey } = parsed.data;
  const hasAnyPredefined = Boolean(publicKey || secretKey);

  if (hasAnyPredefined && (!publicKey || !secretKey)) {
    return res.status(400).json({
      message:
        "Both publicKey and secretKey must be provided together when specifying predefined keys",
    });
  }

  if (publicKey && !publicKey.startsWith("pk-lf-")) {
    return res
      .status(400)
      .json({ message: "publicKey must start with 'pk-lf-'" });
  }
  if (secretKey && !secretKey.startsWith("sk-lf-")) {
    return res
      .status(400)
      .json({ message: "secretKey must start with 'sk-lf-'" });
  }

  try {
    const apiKeyMeta = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      note,
      scope: "PROJECT",
      predefinedKeys:
        publicKey && secretKey ? { publicKey, secretKey } : undefined,
    });

    await auditLog({
      resourceType: "apiKey",
      resourceId: apiKeyMeta.id,
      action: "create",
      orgId,
      projectId,
      orgRole: "ADMIN",
      apiKeyId: "ORG_KEY",
    });

    logger.info(`Created API key ${apiKeyMeta.id} for project ${projectId}`);

    return res.status(201).json(apiKeyMeta);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (
      message.includes("Unique constraint") ||
      message.includes("unique constraint")
    ) {
      return res.status(409).json({
        message:
          "API key with the provided publicKey or secretKey already exists",
      });
    }
    throw e;
  }
}
