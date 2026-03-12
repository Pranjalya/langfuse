import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { z } from "zod/v4";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const querySchema = z.object({
  projectId: z.string(),
  apiKeyId: z.string(),
});

export const validateQueryParams = (
  query: unknown,
): { projectId: string; apiKeyId: string } | null => {
  const parsed = querySchema.safeParse(query);
  return parsed.success ? parsed.data : null;
};

export async function handleDeleteApiKey(
  _req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  apiKeyId: string,
  orgId: string,
) {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: apiKeyId, projectId, scope: "PROJECT" },
  });
  if (!apiKey) {
    return res.status(404).json({ message: "API key not found" });
  }

  const deleted = await new ApiAuthService(prisma, redis).deleteApiKey(
    apiKeyId,
    projectId,
    "PROJECT",
  );
  if (!deleted) {
    return res.status(500).json({ message: "Failed to delete API key" });
  }

  await auditLog({
    resourceType: "apiKey",
    resourceId: apiKeyId,
    action: "delete",
    orgId,
    projectId,
    orgRole: "ADMIN",
    apiKeyId: "ORG_KEY",
  });

  logger.info(`Deleted API key ${apiKeyId} for project ${projectId}`);

  return res.status(200).json({ success: true });
}
