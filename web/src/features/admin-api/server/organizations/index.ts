import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { organizationNameSchema } from "@/src/features/organizations/utils/organizationNameSchema";

export const handleGetOrganizations = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { page, limit } = req.query;
  const pageNumber = Math.max(1, parseInt(page as string) || 1);
  const limitNumber = Math.min(
    100,
    Math.max(1, parseInt(limit as string) || 50),
  );

  try {
    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        skip: (pageNumber - 1) * limitNumber,
        take: limitNumber,
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
        orderBy: { createdAt: "desc" },
      }),
      prisma.organization.count(),
    ]);

    return res.status(200).json({
      data: organizations,
      meta: {
        page: pageNumber,
        limit: limitNumber,
        totalItems: total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error("Error fetching admin organizations", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const handleCreateOrganization = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const parsedBody = organizationNameSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsedBody.error,
    });
  }

  const { name } = parsedBody.data;

  try {
    const organization = await prisma.organization.create({
      data: { name },
    });

    await auditLog({
      userId: "admin-api",
      orgId: organization.id,
      resourceType: "organization",
      resourceId: organization.id,
      action: "create",
      after: organization,
    });

    return res.status(201).json(organization);
  } catch (error) {
    console.error("Error creating organization via admin api", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
