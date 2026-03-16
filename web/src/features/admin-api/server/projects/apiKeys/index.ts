import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { prisma, ApiKeyScope } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server";

export const validateQueryAndExtractId = (query: NextApiRequest["query"]) => {
  if (
    !query.projectId ||
    Array.isArray(query.projectId) ||
    typeof query.projectId !== "string"
  ) {
    return null;
  }
  return query.projectId;
};

export const handleGetApiKeys = async (
  _req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
) => {
  try {
    const apiKeys = await prisma.apiKey.findMany({
      where: { projectId },
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
    console.error("Error fetching admin project api keys", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const predefinedApiKeySchema = z.object({
  publicKey: z.string().startsWith("pk-lf-"),
  secretKey: z.string().startsWith("sk-lf-"),
});

const createApiKeySchema = z.object({
  note: z.string().optional(),
  predefinedKeys: predefinedApiKeySchema.optional(),
});

export const handleCreateApiKey = async (
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
) => {
  const parsedBody = createApiKeySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsedBody.error,
    });
  }

  const { note, predefinedKeys } = parsedBody.data;

  try {
    // We must pass the orgId linked to the project for audit logging and constraint if needed
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const orgId = project.orgId;

    const keys = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      note,
      scope: ApiKeyScope.PROJECT,
      predefinedKeys,
    });

    await auditLog({
      userId: "admin-api",
      orgId: orgId,
      projectId: projectId,
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
  } catch (error: any) {
    console.error("Error creating admin project api key", error);
    if (error.code === "P2002") {
      return res
        .status(409)
        .json({
          error:
            "API key collision. Please try generating again or use a unique predefined key.",
        });
    }
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
