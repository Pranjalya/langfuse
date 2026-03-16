import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const membershipRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);

const updateMembershipSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: membershipRoleSchema,
});

export const handleGetProjectMembers = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { projectId } = req.query;

  try {
    const projIdStr = projectId as string;
    const memberships = await prisma.projectMembership.findMany({
      where: { projectId: projIdStr },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return res.status(200).json(memberships);
  } catch (error) {
    console.error("Error fetching project members admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const handleUpdateProjectMember = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { projectId } = req.query;
  const parsedBody = updateMembershipSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsedBody.error,
    });
  }

  const { email, role } = parsedBody.data;
  const projIdStr = projectId as string;

  try {
    // Check if the project exists
    const proj = await prisma.project.findUnique({
      where: { id: projIdStr, deletedAt: null },
    });
    if (!proj) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      return res.status(404).json({
        error:
          "User not found with the provided email. They must sign up first.",
      });
    }

    // CRUCIAL: Verify user is a member of the parent organization
    const orgMembership = await prisma.organizationMembership.findUnique({
      where: {
        orgId_userId: {
          orgId: proj.orgId,
          userId: user.id,
        },
      },
    });

    if (!orgMembership) {
      return res.status(400).json({
        error:
          "User is not a member of the parent organization. Add them to the organization first.",
      });
    }

    // Check if project membership exists
    const existingMembership = await prisma.projectMembership.findUnique({
      where: {
        projectId_userId: {
          projectId: projIdStr,
          userId: user.id,
        },
      },
    });

    let membership;
    if (existingMembership) {
      // Update
      membership = await prisma.projectMembership.update({
        where: {
          projectId_userId: {
            projectId: projIdStr,
            userId: user.id,
          },
        },
        data: { role },
      });
      await auditLog({
        userId: "admin-api",
        orgId: proj.orgId,
        projectId: projIdStr,
        resourceType: "projectMembership",
        resourceId: `${projIdStr}_${user.id}`, // Custom resource ID for composite key
        action: "update",
        before: existingMembership,
        after: membership,
      });
    } else {
      // Create
      membership = await prisma.projectMembership.create({
        data: {
          projectId: projIdStr,
          userId: user.id,
          orgMembershipId: orgMembership.id,
          role,
        },
      });
      await auditLog({
        userId: "admin-api",
        orgId: proj.orgId,
        projectId: projIdStr,
        resourceType: "projectMembership",
        resourceId: `${projIdStr}_${user.id}`,
        action: "create",
        after: membership,
      });
    }

    return res.status(200).json(membership);
  } catch (error) {
    console.error("Error upserting project member via admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteMembershipSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const handleDeleteProjectMember = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { projectId } = req.query;
  const parsedBody = deleteMembershipSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsedBody.error,
    });
  }

  const { email } = parsedBody.data;
  const projIdStr = projectId as string;

  try {
    const proj = await prisma.project.findUnique({
      where: { id: projIdStr },
    });
    if (!proj) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Find the user to get userId
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const membership = await prisma.projectMembership.findUnique({
      where: {
        projectId_userId: {
          projectId: projIdStr,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      return res
        .status(404)
        .json({ error: "Membership not found in the project" });
    }

    await prisma.projectMembership.delete({
      where: {
        projectId_userId: {
          projectId: projIdStr,
          userId: user.id,
        },
      },
    });

    await auditLog({
      userId: "admin-api",
      orgId: proj.orgId,
      projectId: projIdStr,
      resourceType: "projectMembership",
      resourceId: `${projIdStr}_${user.id}`,
      action: "delete",
      before: membership,
    });

    return res
      .status(200)
      .json({ message: "Project Membership deleted successfully" });
  } catch (error) {
    console.error("Error deleting project member via admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
