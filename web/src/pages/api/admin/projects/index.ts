import { type NextApiRequest, type NextApiResponse } from "next";
import { logger } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/features/admin-api/server/adminApiAuth";
import {
  handleGetProjects,
  handleCreateProject,
} from "@/src/features/admin-api/server/projects";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    if (!AdminApiAuthService.handleAdminAuth(req, res)) {
      return;
    }

    if (req.method === "GET") {
      return await handleGetProjects(req, res);
    }

    if (req.method === "POST") {
      return await handleCreateProject(req, res);
    }
  } catch (e) {
    logger.error("Failed to process projects request", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
