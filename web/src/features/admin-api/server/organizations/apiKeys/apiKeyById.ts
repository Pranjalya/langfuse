import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { z } from "zod/v4";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const querySchema = z.object({
  organizationId: z.string(),
  apiKeyId: z.string(),
});

export const validateQueryParams = (
  query: unknown,
): { organizationId: string; apiKeyId: string } | null => {
  const parsed = querySchema.safeParse(query);
  return parsed.success ? parsed.data : null;
};

export async function handleDeleteApiKey(
  _req: NextApiRequest,
  res: NextApiResponse,
  organizationId: string,
  apiKeyId: string,
) {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: apiKeyId, orgId: organizationId, scope: "ORGANIZATION" },
  });
  if (!apiKey) {
    return res.status(404).json({ error: "API key not found" });
  }

  const deleted = await new ApiAuthService(prisma, redis).deleteApiKey(
    apiKeyId,
    organizationId,
    "ORGANIZATION",
  );
  if (!deleted) {
    return res.status(500).json({ error: "Failed to delete API key" });
  }

  await auditLog({
    resourceType: "apiKey",
    resourceId: apiKeyId,
    action: "delete",
    orgId: organizationId,
    orgRole: "ADMIN",
    apiKeyId: "ADMIN_KEY",
  });

  logger.info(
    `Deleted API key ${apiKeyId} for organization ${organizationId} via admin API`,
  );

  return res.status(200).json({ success: true });
}
