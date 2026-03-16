import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { organizationNameSchema } from "@/src/features/organizations/utils/organizationNameSchema";

export const handleGetOrganization = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { organizationId } = req.query;

  try {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId as string },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        metadata: true,
        projects: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    return res.status(200).json(organization);
  } catch (error) {
    console.error("Error fetching organization via admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const updateOrganizationSchema = z.object({
  name: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const handleUpdateOrganization = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { organizationId } = req.query;
  const parsedBody = updateOrganizationSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsedBody.error,
    });
  }

  try {
    const orgIdStr = organizationId as string;
    const organizationBefore = await prisma.organization.findUnique({
      where: { id: orgIdStr },
    });

    if (!organizationBefore) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const updatedOrganization = await prisma.organization.update({
      where: { id: orgIdStr },
      data: parsedBody.data,
    });

    await auditLog({
      userId: "admin-api",
      orgId: orgIdStr,
      resourceType: "organization",
      resourceId: orgIdStr,
      action: "update",
      before: organizationBefore,
      after: updatedOrganization,
    });

    return res.status(200).json(updatedOrganization);
  } catch (error) {
    console.error("Error updating organization via admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const handleDeleteOrganization = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { organizationId } = req.query;

  try {
    const orgIdStr = organizationId as string;

    // CRUCIAL: Check if any projects exist (even soft deleted)
    const projectCount = await prisma.project.count({
      where: { orgId: orgIdStr },
    });

    if (projectCount > 0) {
      return res.status(400).json({
        error:
          "Cannot delete organization with existing projects. Please delete all projects first.",
      });
    }

    const organizationBefore = await prisma.organization.findUnique({
      where: { id: orgIdStr },
    });

    if (!organizationBefore) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const deletedOrganization = await prisma.organization.delete({
      where: { id: orgIdStr },
    });

    await auditLog({
      userId: "admin-api",
      orgId: orgIdStr,
      resourceType: "organization",
      resourceId: orgIdStr,
      action: "delete",
      before: organizationBefore,
    });

    return res.status(200).json(deletedOrganization);
  } catch (error) {
    console.error("Error deleting organization via admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
