import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { redis } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";

export const validateQueryParams = (query: NextApiRequest["query"]) => {
  if (
    !query.organizationId ||
    Array.isArray(query.organizationId) ||
    typeof query.organizationId !== "string" ||
    !query.apiKeyId ||
    Array.isArray(query.apiKeyId) ||
    typeof query.apiKeyId !== "string"
  ) {
    return null;
  }
  return {
    organizationId: query.organizationId,
    apiKeyId: query.apiKeyId,
  };
};

export const handleDeleteApiKey = async (
  _req: NextApiRequest,
  res: NextApiResponse,
  organizationId: string,
  apiKeyId: string,
) => {
  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { id: apiKeyId, orgId: organizationId },
    });

    if (!apiKey) {
      return res.status(404).json({ error: "API key not found" });
    }

    await prisma.apiKey.delete({
      where: { id: apiKeyId },
    });

    // Invalidate the cache for this org
    await new ApiAuthService(prisma, redis).invalidateCachedOrgApiKeys(
      organizationId,
    );

    await auditLog({
      userId: "admin-api",
      orgId: organizationId,
      resourceType: "apiKey",
      resourceId: apiKeyId,
      action: "delete",
      before: {
        id: apiKey.id,
        publicKey: apiKey.publicKey,
        displaySecretKey: apiKey.displaySecretKey,
        note: apiKey.note,
        createdAt: apiKey.createdAt,
      },
    });

    return res.status(200).json({ message: "API key deleted successfully" });
  } catch (error) {
    console.error("Error deleting admin organization api key", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
