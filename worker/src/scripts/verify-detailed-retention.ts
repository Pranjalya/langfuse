import {
  clickhouseClient,
  StorageServiceFactory,
  StorageService,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { handleDataRetentionProcessingJob } from "../ee/dataRetention/handleDataRetentionProcessingJob";
import { env } from "../env";
import { randomUUID } from "crypto";

async function main() {
  console.log("🚀 Starting Detailed Data Retention Verification...");

  const projectId = `test-project-${randomUUID()}`;
  const orgId = `test-org-${randomUUID()}`;
  console.log(`Using Project ID: ${projectId}, Org ID: ${orgId}`);

  // 1. Initial Setup: Create Org and Project
  await prisma.organization.create({
    data: {
      id: orgId,
      name: "Verification Org",
    },
  });

  await prisma.project.create({
    data: {
      id: projectId,
      name: "Verification Project",
      retentionDays: 7,
      orgId: orgId,
    },
  });

  const storageService = StorageServiceFactory.getInstance({
    accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
    secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
    bucketName: String(env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET),
    endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
    region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
    forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
  });

  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago (expired)
  const recentDate = new Date(); // Recent (not expired)

  console.log("\n--- Pre-seeding data ---");

  // 2. Seed Data
  // Traces in ClickHouse
  const expiredTraceId = randomUUID();
  const recentTraceId = randomUUID();

  await clickhouseClient().insert({
    table: "traces",
    format: "JSONEachRow",
    values: [
      {
        id: expiredTraceId,
        project_id: projectId,
        timestamp: cutoffDate.getTime(),
        name: "expired-trace",
      },
      {
        id: recentTraceId,
        project_id: projectId,
        timestamp: recentDate.getTime(),
        name: "recent-trace",
      },
    ],
  });

  // Media in Postgres and S3
  const expiredMediaId = randomUUID();
  const expiredMediaPath = `media/${projectId}/${expiredMediaId}.txt`;
  await storageService.uploadFile({
    fileName: expiredMediaPath,
    fileType: "text/plain",
    data: "expired media content",
  });

  await prisma.media.create({
    data: {
      id: expiredMediaId,
      projectId,
      sha256Hash: randomUUID(),
      bucketPath: expiredMediaPath,
      bucketName: String(env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET),
      contentType: "text/plain",
      contentLength: 20,
      createdAt: cutoffDate,
    },
  });

  // Ingestion Logs in ClickHouse and S3
  const expiredLogId = randomUUID();
  const expiredLogPath = `events/${projectId}/${expiredLogId}.json`;
  const eventStorageClient = StorageServiceFactory.getInstance({
    accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
    secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
    bucketName: String(env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET),
    endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
    region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
    forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
  });
  await eventStorageClient.uploadFile({
    fileName: expiredLogPath,
    fileType: "application/json",
    data: JSON.stringify({ event: "expired" }),
  });

  await clickhouseClient().insert({
    table: "blob_storage_file_log",
    format: "JSONEachRow",
    values: [
      {
        id: randomUUID(),
        project_id: projectId,
        entity_type: "trace",
        entity_id: expiredTraceId,
        event_id: randomUUID(),
        bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
        bucket_path: expiredLogPath,
        created_at: cutoffDate.getTime(),
      },
    ],
  });

  console.log("Waiting for ClickHouse consistency...");
  await new Promise((r) => setTimeout(r, 2000));

  // 3. Log Counts Before
  async function logCounts(label: string) {
    const pgMedia = await prisma.media.count({ where: { projectId } });

    const chTracesResultSet = await clickhouseClient().query({
      query: `SELECT count() as count FROM traces WHERE project_id = '${projectId}'`,
      format: "JSONEachRow",
    });
    const chTraces = await chTracesResultSet.json<any>();

    const chLogsResultSet = await clickhouseClient().query({
      query: `SELECT count() as count FROM blob_storage_file_log FINAL WHERE project_id = '${projectId}' AND is_deleted = '0'`,
      format: "JSONEachRow",
    });
    const chLogs = await chLogsResultSet.json<any>();

    // Check S3
    const mediaFiles = await storageService.listFiles(`media/${projectId}/`);
    const logFiles = await eventStorageClient.listFiles(`events/${projectId}/`);

    console.log(`\n--- ${label} ---`);
    console.log(`Postgres Media Count: ${pgMedia}`);
    console.log(`ClickHouse Trace Count: ${chTraces[0].count}`);
    console.log(`ClickHouse Ingestion Log Count: ${chLogs[0].count}`);
    console.log(`S3 Media File Count: ${mediaFiles.length}`);
    console.log(`S3 Ingestion Log File Count: ${logFiles.length}`);

    return {
      pgMedia,
      chTraces: parseInt(chTraces[0].count),
      chLogs: parseInt(chLogs[0].count),
      mediaFiles: mediaFiles.length,
      logFiles: logFiles.length,
    };
  }

  const before = await logCounts("BEFORE RETENTION JOB");

  // 4. Run Retention Job
  console.log("\n--- Running handleDataRetentionProcessingJob ---");
  await handleDataRetentionProcessingJob({
    data: { payload: { projectId, retention: 7 } },
  } as any);

  console.log("Waiting for ClickHouse consistency (5s)...");
  await new Promise((r) => setTimeout(r, 5000));

  // 5. Log Counts After
  const after = await logCounts("AFTER RETENTION JOB");

  // 6. Report Results
  console.log("\n--- Summary ---");
  console.log(`Media Records Deleted (PG): ${before.pgMedia - after.pgMedia}`);
  console.log(`Traces Deleted (CH): ${before.chTraces - after.chTraces}`);
  console.log(`Log Records Deleted (CH): ${before.chLogs - after.chLogs}`);
  console.log(
    `Media Files Deleted (S3): ${before.mediaFiles - after.mediaFiles}`,
  );
  console.log(`Log Files Deleted (S3): ${before.logFiles - after.logFiles}`);

  if (
    after.pgMedia === 0 &&
    after.chTraces === 1 &&
    after.chLogs === 0 &&
    after.mediaFiles === 0 &&
    after.logFiles === 0
  ) {
    console.log(
      "\n✅ SUCCESS: Data retention correctly identified and deleted expired data across all layers!",
    );
  } else {
    console.log("\n❌ FAILURE: Data counts do not match expected results.");
    process.exit(1);
  }

  // Cleanup
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.organization.delete({ where: { id: orgId } });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
