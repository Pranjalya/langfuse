import { expect, it, describe, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { handleDataRetentionSchedulerJob } from "../features/data-retention/scheduler";
import {
  getQueue,
  QueueName,
  QueueJobs,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

// Mock the queueRegistry
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    getQueue: vi.fn(),
  };
});

describe("MIT DataRetentionSchedulerJob", () => {
  let projectId: string;
  const mockQueue = {
    add: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    (getQueue as any).mockReturnValue(mockQueue);

    // Create a fresh project for each test
    const context = await createOrgProjectAndApiKey();
    projectId = context.projectId;

    // Ensure project has retention enabled
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 30 },
    });
  });

  afterEach(async () => {
    // Clean up project
    if (projectId) {
      await prisma.project.delete({
        where: { id: projectId },
      });
    }
  });

  it("should queue a job for projects with retentionDays > 0", async () => {
    // When
    await handleDataRetentionSchedulerJob();

    // Then
    expect(getQueue).toHaveBeenCalledWith(QueueName.DataRetentionQueue);
    expect(mockQueue.add).toHaveBeenCalledWith(
      QueueJobs.DataRetentionProcessingJob,
      expect.objectContaining({
        payload: {
          projectId: projectId,
          retentionDays: 30,
        },
      }),
      expect.any(Object)
    );
  });

  it("should NOT queue a job for projects with retentionDays null", async () => {
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });

    // When
    await handleDataRetentionSchedulerJob();

    // Then
    const projectACalls = mockQueue.add.mock.calls.filter(
      (call: any) => call[1]?.payload?.projectId === projectId
    );
    expect(projectACalls).toHaveLength(0);
  });

  it("should NOT queue a job for projects with retentionDays = 0", async () => {
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 0 },
    });

    // When
    await handleDataRetentionSchedulerJob();

    // Then
    const projectACalls = mockQueue.add.mock.calls.filter(
      (call: any) => call[1]?.payload?.projectId === projectId
    );
    expect(projectACalls).toHaveLength(0);
  });
});
