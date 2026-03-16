import { type NextApiRequest, type NextApiResponse } from "next";
import { logger } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/features/admin-api/server/adminApiAuth";
import {
  validateQueryAndExtractId,
  handleGetApiKeys,
  handleCreateApiKey,
} from "@/src/features/admin-api/server/projects/apiKeys";
import { prisma } from "@langfuse/shared/src/db";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    // Verify admin API authentication
    if (!AdminApiAuthService.handleAdminAuth(req, res)) {
      return;
    }

    const projectId = validateQueryAndExtractId(req.query);
    if (!projectId) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Handle different HTTP methods
    switch (req.method) {
      case "GET":
        return await handleGetApiKeys(req, res, projectId);
      case "POST":
        return await handleCreateApiKey(req, res, projectId);
      default:
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
  } catch (e) {
    logger.error("Failed to process project API key request", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
