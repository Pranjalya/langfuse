import { type NextApiRequest, type NextApiResponse } from "next";
import { logger } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/features/admin-api/server/adminApiAuth";
import {
  validateQueryParams,
  handleDeleteApiKey,
} from "@/src/features/admin-api/server/projects/apiKeys/apiKeyById";
import { prisma } from "@langfuse/shared/src/db";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "DELETE") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    if (!AdminApiAuthService.handleAdminAuth(req, res)) {
      return;
    }

    const params = validateQueryParams(req.query);
    if (!params) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    const { projectId, apiKeyId } = params;

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    switch (req.method) {
      case "DELETE":
        return await handleDeleteApiKey(req, res, projectId, apiKeyId);
      default:
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
  } catch (e) {
    logger.error("Failed to process project API key request", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
