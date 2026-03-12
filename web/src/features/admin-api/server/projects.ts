import { prisma } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";

export async function handleGetProjects(
  _req: NextApiRequest,
  res: NextApiResponse,
  orgId: string,
) {
  const projects = await prisma.project.findMany({
    where: { orgId, deletedAt: null },
    select: {
      id: true,
      name: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return res.status(200).json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      metadata: p.metadata,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  });
}
