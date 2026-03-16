import { type NextApiRequest, type NextApiResponse } from "next";
import { logger } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/features/admin-api/server/adminApiAuth";
import {
  handleGetOrganizationMembers,
  handleUpdateOrganizationMember,
  handleDeleteOrganizationMember,
} from "@/src/features/admin-api/server/organizations/members";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (!AdminApiAuthService.handleAdminAuth(req, res)) {
      return;
    }

    switch (req.method) {
      case "GET":
        return await handleGetOrganizationMembers(req, res);
      case "PUT":
        return await handleUpdateOrganizationMember(req, res);
      case "DELETE":
        return await handleDeleteOrganizationMember(req, res);
      default:
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
  } catch (e) {
    logger.error("Failed to process organization members request", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
