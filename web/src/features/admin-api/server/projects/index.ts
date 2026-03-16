import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(60, "Name too long"),
  orgId: z.string().min(1, "Organization ID is required"),
  retentionDays: z.number().int().min(0).optional().nullable(),
  metadata: z.record(z.any()).optional(),
});

export const handleGetProjects = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { orgId, page, limit } = req.query;

  if (!orgId || typeof orgId !== "string") {
    return res.status(400).json({ error: "orgId query parameter is required" });
  }

  const pageNumber = Math.max(1, parseInt(page as string) || 1);
  const limitNumber = Math.min(
    100,
    Math.max(1, parseInt(limit as string) || 50),
  );

  try {
    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where: {
          orgId,
          deletedAt: null,
        },
        skip: (pageNumber - 1) * limitNumber,
        take: limitNumber,
        select: {
          id: true,
          orgId: true,
          name: true,
          retentionDays: true,
          createdAt: true,
          updatedAt: true,
          metadata: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.project.count({
        where: {
          orgId,
          deletedAt: null,
        },
      }),
    ]);

    return res.status(200).json({
      data: projects,
      meta: {
        page: pageNumber,
        limit: limitNumber,
        totalItems: total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error("Error fetching projects via admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const handleCreateProject = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const parsedBody = createProjectSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsedBody.error,
    });
  }

  const { name, orgId, retentionDays, metadata } = parsedBody.data;

  try {
    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Check project name uniqueness in the org
    const existingProject = await prisma.project.findFirst({
      where: {
        orgId,
        name,
        deletedAt: null,
      },
    });

    if (existingProject) {
      return res
        .status(400)
        .json({
          error: "Project with this name already exists in the organization",
        });
    }

    // Validate data retention entitlement
    /*
    if (retentionDays && retentionDays > 0) {
      if (
        !hasEntitlementBasedOnPlan({
          plan: getSelfHostedInstancePlanServerSide(),
          entitlement: "data-retention",
        })
      ) {
        return res.status(403).json({
          error:
            "Data retention setting is not available on your current plan.",
        });
      }
    }
    */

    const project = await prisma.project.create({
      data: {
        name,
        orgId,
        retentionDays: retentionDays ?? null,
        metadata: metadata ?? undefined,
      },
    });

    await auditLog({
      userId: "admin-api",
      orgId: project.orgId,
      projectId: project.id,
      resourceType: "project",
      resourceId: project.id,
      action: "create",
      after: project,
    });

    return res.status(201).json(project);
  } catch (error) {
    console.error("Error creating project via admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
