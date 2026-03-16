import { expect, it, describe, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import {
  createObservation,
  createObservationsCh,
  createTraceScore,
  createScoresCh,
  createTrace,
  createTracesCh,
  getObservationById,
  getScoreById,
  getTraceById,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { handleDataRetentionProcessingJob } from "../features/data-retention/worker";
import { Job } from "bullmq";

describe("MIT DataRetentionProcessingJob", () => {
  let projectId: string;

  beforeEach(async () => {
    // Create a fresh project for each test to avoid interference
    const context = await createOrgProjectAndApiKey();
    projectId = context.projectId;
  });

  afterEach(async () => {
    // Clean up project after each test
    if (projectId) {
      await prisma.project.delete({
        where: { id: projectId },
      });
    }
  });

  it("should delete traces older than retention days", async () => {
    // Setup: Set retention in database to 7 days
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const baseId = randomUUID();
    await createTracesCh([
      createTrace({
        id: `${baseId}-trace-old`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
      createTrace({
        id: `${baseId}-trace-new`,
        project_id: projectId,
      }),
    ]);

    // When: Run the MIT worker job
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retentionDays: 7 } },
    } as Job);

    // Then
    const traceOld = await getTraceById({
      traceId: `${baseId}-trace-old`,
      projectId,
    });
    expect(traceOld).toBeUndefined();
    const traceNew = await getTraceById({
      traceId: `${baseId}-trace-new`,
      projectId,
    });
    expect(traceNew).toBeDefined();
  });

  it("should delete observations older than retention days", async () => {
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const baseId = randomUUID();
    await createObservationsCh([
      createObservation({
        id: `${baseId}-observation-old`,
        project_id: projectId,
        start_time: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
      createObservation({
        id: `${baseId}-observation-new`,
        project_id: projectId,
      }),
    ]);

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retentionDays: 7 } },
    } as Job);

    // Then
    await expect(
      getObservationById({ id: `${baseId}-observation-old`, projectId }),
    ).rejects.toThrowError("not found");
    const observationNew = await getObservationById({
      id: `${baseId}-observation-new`,
      projectId,
    });
    expect(observationNew).toBeDefined();
  });

  it("should delete scores older than retention days", async () => {
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const baseId = randomUUID();
    await createScoresCh([
      createTraceScore({
        id: `${baseId}-score-old`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
      createTraceScore({
        id: `${baseId}-score-new`,
        project_id: projectId,
      }),
    ]);

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retentionDays: 7 } },
    } as Job);

    // Then
    const scoresOld = await getScoreById({
      projectId,
      scoreId: `${baseId}-score-old`,
    });
    expect(scoresOld).toBeUndefined();
    const scoresNew = await getScoreById({
      projectId,
      scoreId: `${baseId}-score-new`,
    });
    expect(scoresNew).toBeDefined();
  });
});
