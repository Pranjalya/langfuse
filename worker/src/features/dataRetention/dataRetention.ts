import { Job, Processor } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import {
  DataRetentionProcessingQueue,
  QueueJobs,
  logger,
  instrumentAsync,
  deleteEventsOlderThanDays,
  deleteObservationsOlderThanDays,
  deleteScoresOlderThanDays,
  deleteTracesOlderThanDays,
  getS3MediaStorageClient,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
  getCurrentSpan,
} from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";
import { randomUUID } from "crypto";
import { env } from "../../env";

/**
 * 1. SCHEDULER: Finds all projects with active retention policies and queues them.
 */
async function queueRetentionJobs() {
  const projects = await prisma.project.findMany({
    where: { retentionDays: { gt: 0 } },
    select: { id: true, retentionDays: true },
  });

  if (projects.length === 0) return;

  const queue = DataRetentionProcessingQueue.getInstance();
  if (!queue)
    throw new Error("DataRetentionProcessingQueue is not initialized");

  const jobsToQueue = projects.map((p) => ({
    name: QueueJobs.DataRetentionProcessingJob,
    data: {
      id: randomUUID(),
      name: QueueJobs.DataRetentionProcessingJob,
      timestamp: new Date(),
      payload: { projectId: p.id, retention: p.retentionDays },
    },
  }));

  await queue.addBulk(jobsToQueue);
  logger.info(`[OSS Retention] Enqueued jobs for ${projects.length} projects.`);
}

/**
 * 2. PROCESSOR: Executes the actual cleanup for a single project.
 */
async function executeProjectCleanup(job: Job) {
  const { projectId } = job.data.payload;
  const span = getCurrentSpan();

  if (span) {
    span.setAttribute("messaging.bullmq.job.input.jobId", job.data.id);
    span.setAttribute("messaging.bullmq.job.input.projectId", projectId);
  }

  // Always re-verify retention against the database to prevent stale job executions
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { retentionDays: true },
  });

  const activeRetention = project?.retentionDays;
  if (!activeRetention || activeRetention <= 0) {
    logger.info(
      `[OSS Retention] Skipped ${projectId} - Retention is disabled.`,
    );
    return;
  }

  if (span) {
    span.setAttribute(
      "messaging.bullmq.job.input.retentionId",
      activeRetention,
    );
  }

  const cutoffDate = new Date(
    Date.now() - activeRetention * 24 * 60 * 60 * 1000,
  );
  logger.info(
    `[OSS Retention] Cleaning up project ${projectId} older than ${activeRetention} days (Cutoff: ${cutoffDate})`,
  );

  // Cleanup Media
  if (env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
    await cleanupS3Media(
      projectId,
      cutoffDate,
      env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
    );
  }

  // Cleanup ClickHouse and S3 Events
  const dbTasks: Promise<unknown>[] = [
    deleteTracesOlderThanDays(projectId, cutoffDate),
    deleteObservationsOlderThanDays(projectId, cutoffDate),
    deleteScoresOlderThanDays(projectId, cutoffDate),
  ];

  if (env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG === "true") {
    dbTasks.push(
      removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject(
        projectId,
        cutoffDate,
      ),
    );
  }

  if (env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true") {
    dbTasks.push(deleteEventsOlderThanDays(projectId, cutoffDate));
  }

  await Promise.all(dbTasks);

  if (env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true") {
    dbTasks.push(deleteEventsOlderThanDays(projectId, cutoffDate));
  }

  await Promise.all(dbTasks);
  logger.info(`[OSS Retention] Completed processing for project ${projectId}.`);
}

/**
 * HELPER: Deletes media from S3 and the Postgres database.
 */
async function cleanupS3Media(
  projectId: string,
  cutoffDate: Date,
  bucket: string,
) {
  const expiredMedia = await prisma.media.findMany({
    where: { projectId, createdAt: { lte: cutoffDate } },
    select: { id: true, bucketPath: true },
  });

  if (expiredMedia.length === 0) return;

  const s3Client = getS3MediaStorageClient(bucket);
  await s3Client.deleteFiles(expiredMedia.map((m) => m.bucketPath));

  await prisma.media.deleteMany({
    where: { id: { in: expiredMedia.map((m) => m.id) }, projectId },
  });

  logger.info(
    `[OSS Retention] Purged ${expiredMedia.length} media records for project ${projectId}.`,
  );
}

/**
 * 3. BULLMQ EXPORTS: Bindings for the queue processor
 */
export const ossDataRetentionSchedulerProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.DataRetentionJob) {
    await queueRetentionJobs();
  }
};

export const ossDataRetentionWorkerProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.DataRetentionProcessingJob) {
    return await instrumentAsync(
      {
        name: "oss-process-data-retention",
        startNewTrace: true,
        spanKind: SpanKind.CONSUMER,
      },
      () => executeProjectCleanup(job),
    );
  }
};
