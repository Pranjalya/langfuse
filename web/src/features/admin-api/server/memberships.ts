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
  orgId: string,
) {
  const memberships = await prisma.organizationMembership.findMany({
    where: { orgId },
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
  orgId: string,
) {
  const parsed = upsertBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.issues,
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
  });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const membership = await prisma.organizationMembership.upsert({
    where: {
      orgId_userId: { orgId, userId: parsed.data.userId },
    },
    update: { role: parsed.data.role },
    create: { orgId, userId: parsed.data.userId, role: parsed.data.role },
  });

  return res.status(200).json({
    userId: membership.userId,
    role: membership.role,
    email: user.email,
    name: user.name,
  });
}

export async function handleDeleteMembership(
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string,
) {
  const parsed = deleteBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.issues,
    });
  }

  await prisma.organizationMembership.deleteMany({
    where: { orgId, userId: parsed.data.userId },
  });

  return res.status(200).json({
    message: "Membership deleted successfully",
    userId: parsed.data.userId,
  });
}
