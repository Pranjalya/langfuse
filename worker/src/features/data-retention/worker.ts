import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import {
  logger,
  deleteTracesOlderThanDays,
  deleteScoresOlderThanDays,
  deleteObservationsOlderThanDays,
  deleteEventsOlderThanDays,
  getS3MediaStorageClient,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

export const handleDataRetentionProcessingJob = async (job: Job) => {
  const { projectId, retentionDays: jobRetentionDays } = job.data.payload;

  if (!projectId) {
    logger.warn(`Skipping data retention job: missing projectId`);
    return;
  }

  // CRUCIAL: Re-fetch project to verify retentionDays
  const project = await prisma.project.findUnique({
    where: { id: projectId, deletedAt: null },
    select: { id: true, retentionDays: true },
  });

  if (!project) {
    logger.info(`Skipping data retention: project not found or deleted`, {
      projectId,
    });
    return;
  }

  const effectiveRetentionDays = project.retentionDays ?? jobRetentionDays;

  if (!effectiveRetentionDays || effectiveRetentionDays <= 0) {
    logger.info(`Skipping data retention: retention disabled for project`, {
      projectId,
    });
    return;
  }

  logger.info(
    `Processing data retention for project ${projectId} with retention ${effectiveRetentionDays} days`,
  );

  const cutoffDate = new Date(Date.now() - effectiveRetentionDays * 86400000);

  // 1. Delete Media from S3 and DB
  try {
    const bucketName = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;
    if (bucketName) {
      const s3Client = getS3MediaStorageClient(bucketName);

      const mediaFiles = await prisma.media.findMany({
        where: {
          projectId,
          createdAt: {
            lt: cutoffDate,
          },
        },
        select: { id: true, bucketPath: true },
      });

      if (mediaFiles.length > 0) {
        // Delete from S3
        await s3Client.deleteFiles(mediaFiles.map((m) => m.bucketPath));

        // Delete from DB
        await prisma.media.deleteMany({
          where: {
            projectId,
            id: {
              in: mediaFiles.map((m) => m.id),
            },
          },
        });
        logger.info(
          `Deleted ${mediaFiles.length} media files and records for project ${projectId}`,
        );
      }
    } else {
      logger.debug(
        "Skipping S3 media deletion: LANGFUSE_S3_MEDIA_UPLOAD_BUCKET not configured",
      );
    }
  } catch (err) {
    logger.error("Failed to delete media records for data retention", err);
  }

  // 2. Delete ClickHouse / Postgres Data via shared utilities
  try {
    const tracesDeleted = await deleteTracesOlderThanDays(
      projectId,
      cutoffDate,
    );
    const observationsDeleted = await deleteObservationsOlderThanDays(
      projectId,
      cutoffDate,
    );
    const scoresDeleted = await deleteScoresOlderThanDays(
      projectId,
      cutoffDate,
    );
    const eventsDeleted = await deleteEventsOlderThanDays(
      projectId,
      cutoffDate,
    );

    logger.info(
      `Cleanup results for project ${projectId}: Traces: ${tracesDeleted}, Obs: ${observationsDeleted}, Scores: ${scoresDeleted}, Events: ${eventsDeleted}`,
    );
  } catch (err) {
    logger.error(
      `Failed to execute cleanup repositories for project ${projectId}`,
      err,
    );
  }

  logger.info(`Finished data retention processing for project ${projectId}`);
};
