import { type NextApiRequest, type NextApiResponse } from "next";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";

export class AdminApiAuthService {
  /**
   * Validates the Authorization API Key for Admin endpoints.
   * Returns true if authenticated, false otherwise (and automatically handles the JSON response).
   */
  static handleAdminAuth(req: NextApiRequest, res: NextApiResponse): boolean {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res
        .status(401)
        .json({ error: "Unauthorized: Missing Authorization header" });
      return false;
    }

    const match = authHeader.match(/^Bearer\s+(.*)$/i);
    if (!match) {
      res
        .status(401)
        .json({ error: "Unauthorized: Invalid Authorization scheme" });
      return false;
    }

    const token = match[1];

    if (!env.ADMIN_API_KEY) {
      logger.error("ADMIN_API_KEY is not configured on the server.");
      res
        .status(500)
        .json({ error: "Internal Server Error: Admin API not configured" });
      return false;
    }

    if (token !== env.ADMIN_API_KEY) {
      res.status(403).json({ error: "Forbidden: Invalid Admin API Key" });
      return false;
    }

    return true;
  }
}
