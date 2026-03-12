import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { Role } from "@langfuse/shared";
import { z } from "zod/v4";

const upsertBodySchema = z.object({
  userId: z.string(),
  role: z.enum(Role),
});

const deleteBodySchema = z.object({
  userId: z.string(),
});

export async function handleGetMemberships(
  _req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  orgId: string,
) {
  const memberships = await prisma.projectMembership.findMany({
    where: {
      projectId,
      organizationMembership: { orgId },
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return res.status(200).json({
    memberships: memberships.map((m) => ({
      userId: m.userId,
      role: m.role,
      email: m.user.email,
      name: m.user.name,
    })),
  });
}

export async function handleUpdateMembership(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  orgId: string,
) {
  const parsed = upsertBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.issues,
    });
  }

  const orgMembership = await prisma.organizationMembership.findUnique({
    where: { orgId_userId: { orgId, userId: parsed.data.userId } },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!orgMembership) {
    return res.status(404).json({
      error: "User is not a member of this organization",
    });
  }

  const membership = await prisma.projectMembership.upsert({
    where: {
      projectId_userId: { projectId, userId: parsed.data.userId },
    },
    update: { role: parsed.data.role },
    create: {
      projectId,
      userId: parsed.data.userId,
      role: parsed.data.role,
      orgMembershipId: orgMembership.id,
    },
  });

  return res.status(200).json({
    userId: membership.userId,
    role: membership.role,
    email: orgMembership.user.email,
    name: orgMembership.user.name,
  });
}

export async function handleDeleteMembership(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  orgId: string,
) {
  const parsed = deleteBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.issues,
    });
  }

  const membership = await prisma.projectMembership.findUnique({
    where: {
      projectId_userId: { projectId, userId: parsed.data.userId },
    },
    include: { organizationMembership: { select: { orgId: true } } },
  });
  if (!membership) {
    return res.status(404).json({ error: "Project membership not found" });
  }

  if (membership.organizationMembership.orgId !== orgId) {
    return res.status(403).json({
      error: "Project membership does not belong to this organization",
    });
  }

  await prisma.projectMembership.delete({
    where: { projectId_userId: { projectId, userId: parsed.data.userId } },
  });

  return res.status(200).json({
    message: "Project membership deleted successfully",
    userId: parsed.data.userId,
  });
}
