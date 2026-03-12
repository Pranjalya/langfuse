import { type NextApiRequest, type NextApiResponse } from "next";
import { logger, type ApiAccessScope } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod/v4";
import { AdminApiAuthService } from "@/src/features/admin-api/server/adminApiAuth";
import { handleGetProjects } from "@/src/features/admin-api/server/projects";
import { handleCreateProject } from "@/src/features/admin-api/server/projects/createProject";

const querySchema = z.object({
  organizationId: z.string(),
});

const getOrgIdFromQuery = (query: unknown): string | null => {
  const parsed = querySchema.safeParse(query);
  return parsed.success ? parsed.data.organizationId : null;
};

const buildAdminScope = (orgId: string): ApiAccessScope => ({
  projectId: null,
  accessLevel: "organization",
  orgId,
  plan: "oss",
  rateLimitOverrides: [],
  apiKeyId: "ADMIN_KEY",
  publicKey: "ADMIN_KEY",
  isIngestionSuspended: false,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    if (!AdminApiAuthService.handleAdminAuth(req, res)) {
      return;
    }

    const organizationId = getOrgIdFromQuery(req.query);
    if (!organizationId) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    if (req.method === "GET") {
      return await handleGetProjects(req, res, organizationId);
    }

    return await handleCreateProject(req, res, buildAdminScope(organizationId));
  } catch (e) {
    logger.error("Failed to process organization projects request", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
