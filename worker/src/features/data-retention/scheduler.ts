import { prisma } from "@langfuse/shared/src/db";
import {
  QueueName,
  getQueue,
  QueueJobs,
  logger,
} from "@langfuse/shared/src/server";

export const handleDataRetentionSchedulerJob = async () => {
  logger.info("Running data retention scheduler job");

  const projects = await prisma.project.findMany({
    where: {
      retentionDays: {
        gt: 0,
      },
      deletedAt: null,
    },
    select: {
      id: true,
      retentionDays: true,
    },
  });

  if (projects.length === 0) {
    logger.info("No projects with data retention enabled found");
    return;
  }

  const queue = getQueue(QueueName.DataRetentionQueue);

  for (const project of projects) {
    logger.info(
      `Queueing data retention processing job for project ${project.id} with ${project.retentionDays} days retention`,
    );

    await queue.add(
      QueueJobs.DataRetentionProcessingJob,
      {
        payload: {
          projectId: project.id,
          retentionDays: project.retentionDays,
        },
      },
      {
        removeOnComplete: true,
        removeOnFail: 1000,
        jobId: `data-retention-${project.id}-${new Date().toISOString().split("T")[0]}`,
      },
    );
  }

  logger.info(`Queued data retention jobs for ${projects.length} projects`);
};
