import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { QueueName, getQueue } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { redis } from "@langfuse/shared/src/server";

export const handleGetProject = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { projectId } = req.query;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId as string, deletedAt: null },
      select: {
        id: true,
        orgId: true,
        name: true,
        retentionDays: true,
        createdAt: true,
        updatedAt: true,
        metadata: true,
      },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    return res.status(200).json(project);
  } catch (error) {
    console.error("Error fetching project via admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const updateProjectSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(60).optional(),
  retentionDays: z.number().int().min(0).optional().nullable(),
  metadata: z.record(z.any()).optional(),
});

export const handleUpdateProject = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { projectId } = req.query;
  const parsedBody = updateProjectSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsedBody.error,
    });
  }

  try {
    const projIdStr = projectId as string;
    const projectBefore = await prisma.project.findUnique({
      where: { id: projIdStr, deletedAt: null },
    });

    if (!projectBefore) {
      return res.status(404).json({ error: "Project not found" });
    }

    const { retentionDays, ...rest } = parsedBody.data;

    // Validate data retention entitlement
    /*
    if (
      retentionDays !== undefined &&
      retentionDays !== null &&
      retentionDays > 0
    ) {
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

    const updatedProject = await prisma.project.update({
      where: { id: projIdStr },
      data: {
        ...rest,
        ...(retentionDays !== undefined ? { retentionDays } : {}),
      },
    });

    await auditLog({
      userId: "admin-api",
      orgId: updatedProject.orgId,
      projectId: updatedProject.id,
      resourceType: "project",
      resourceId: updatedProject.id,
      action: "update",
      before: projectBefore,
      after: updatedProject,
    });

    return res.status(200).json(updatedProject);
  } catch (error) {
    console.error("Error updating project via admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const handleDeleteProject = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { projectId } = req.query;

  try {
    const projIdStr = projectId as string;

    const projectBefore = await prisma.project.findUnique({
      where: { id: projIdStr, deletedAt: null },
    });

    if (!projectBefore) {
      return res.status(404).json({ error: "Project not found" });
    }

    // CRUCIAL: Delete API keys and invalidate redis caches
    await new ApiAuthService(prisma, redis).invalidateCachedProjectApiKeys(
      projIdStr,
    );

    await prisma.apiKey.deleteMany({
      where: { projectId: projIdStr },
    });

    // CRUCIAL: Soft Delete Project
    const softDeletedProject = await prisma.project.update({
      where: { id: projIdStr },
      data: { deletedAt: new Date() },
    });

    // Queue Async BullMQ Job for full deletion
    const queue = getQueue(QueueName.ProjectDelete);
    if (!queue) {
      console.error("Failed to find ProjectDelete queue via admin API");
    } else {
      await queue.add(QueueName.ProjectDelete, {
        payload: {
          projectId: projIdStr,
          orgId: softDeletedProject.orgId,
          userId: "admin-api",
        },
        id: projIdStr,
        name: QueueName.ProjectDelete,
        timestamp: new Date(),
      });
    }

    await auditLog({
      userId: "admin-api",
      orgId: softDeletedProject.orgId,
      projectId: softDeletedProject.id,
      resourceType: "project",
      resourceId: softDeletedProject.id,
      action: "delete",
      before: projectBefore,
    });

    return res
      .status(200)
      .json({ message: "Project deleted successfully", id: projIdStr });
  } catch (error) {
    console.error("Error deleting project via admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
