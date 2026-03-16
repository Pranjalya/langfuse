import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { redis } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";

export const validateQueryParams = (query: NextApiRequest["query"]) => {
  if (
    !query.projectId ||
    Array.isArray(query.projectId) ||
    typeof query.projectId !== "string" ||
    !query.apiKeyId ||
    Array.isArray(query.apiKeyId) ||
    typeof query.apiKeyId !== "string"
  ) {
    return null;
  }
  return {
    projectId: query.projectId,
    apiKeyId: query.apiKeyId,
  };
};

export const handleDeleteApiKey = async (
  _req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  apiKeyId: string,
) => {
  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { id: apiKeyId, projectId },
    });

    if (!apiKey) {
      return res.status(404).json({ error: "API key not found" });
    }

    // Need orgId for audit logging
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { orgId: true },
    });

    await prisma.apiKey.delete({
      where: { id: apiKeyId },
    });

    // Invalidate the cache for this project
    await new ApiAuthService(prisma, redis).invalidateCachedProjectApiKeys(
      projectId,
    );

    if (project) {
      await auditLog({
        userId: "admin-api",
        orgId: project.orgId,
        projectId: projectId,
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
    }

    return res.status(200).json({ message: "API key deleted successfully" });
  } catch (error) {
    console.error("Error deleting admin project api key", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
