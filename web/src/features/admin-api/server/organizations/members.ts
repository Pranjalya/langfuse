import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { prisma, Role } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const membershipRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);

const updateMembershipSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: membershipRoleSchema,
});

export const handleGetOrganizationMembers = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { organizationId } = req.query;

  try {
    const orgIdStr = organizationId as string;
    const memberships = await prisma.organizationMembership.findMany({
      where: { orgId: orgIdStr },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return res.status(200).json(memberships);
  } catch (error) {
    console.error("Error fetching organization members admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const handleUpdateOrganizationMember = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { organizationId } = req.query;
  const parsedBody = updateMembershipSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsedBody.error,
    });
  }

  const { email, role } = parsedBody.data;
  const orgIdStr = organizationId as string;

  try {
    // Check if the organization exists
    const org = await prisma.organization.findUnique({
      where: { id: orgIdStr },
    });
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      return res
        .status(404)
        .json({
          error:
            "User not found with the provided email. They must sign up first.",
        });
    }

    // Check if membership exists
    const existingMembership = await prisma.organizationMembership.findUnique({
      where: {
        orgId_userId: {
          orgId: orgIdStr,
          userId: user.id,
        },
      },
    });

    let membership;
    if (existingMembership) {
      // Update
      membership = await prisma.organizationMembership.update({
        where: { id: existingMembership.id },
        data: { role },
      });
      await auditLog({
        userId: "admin-api",
        orgId: orgIdStr,
        resourceType: "orgMembership",
        resourceId: membership.id,
        action: "update",
        before: existingMembership,
        after: membership,
      });
    } else {
      // Create
      membership = await prisma.organizationMembership.create({
        data: {
          orgId: orgIdStr,
          userId: user.id,
          role,
        },
      });
      await auditLog({
        userId: "admin-api",
        orgId: orgIdStr,
        resourceType: "orgMembership",
        resourceId: membership.id,
        action: "create",
        after: membership,
      });
    }

    return res.status(200).json(membership);
  } catch (error) {
    console.error("Error upserting organization member via admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteMembershipSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const handleDeleteOrganizationMember = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { organizationId } = req.query;
  const parsedBody = deleteMembershipSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsedBody.error,
    });
  }

  const { email } = parsedBody.data;
  const orgIdStr = organizationId as string;

  try {
    // Find the user to get userId
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const membership = await prisma.organizationMembership.findUnique({
      where: {
        orgId_userId: {
          orgId: orgIdStr,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      return res
        .status(404)
        .json({ error: "Membership not found in the organization" });
    }

    await prisma.organizationMembership.delete({
      where: { id: membership.id },
    });

    await auditLog({
      userId: "admin-api",
      orgId: orgIdStr,
      resourceType: "orgMembership",
      resourceId: membership.id,
      action: "delete",
      before: membership,
    });

    return res.status(200).json({ message: "Membership deleted successfully" });
  } catch (error) {
    console.error("Error deleting organization member via admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
