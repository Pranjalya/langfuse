import { Processor } from "bullmq";
import { logger } from "@langfuse/shared/src/server";
import {
  ossDataRetentionSchedulerProcessor,
  ossDataRetentionWorkerProcessor,
} from "../features/dataRetention/dataRetention";

export const dataRetentionProcessor: Processor = async (job) => {
  try {
    return await ossDataRetentionSchedulerProcessor(job);
  } catch (error) {
    logger.error("Error executing DataRetentionJob", error);
    throw error;
  }
};

export const dataRetentionProcessingProcessor: Processor = async (job) => {
  try {
    return await ossDataRetentionWorkerProcessor(job);
  } catch (error) {
    logger.error("Error executing DataRetentionProcessingJob", error);
    throw error;
  }
};
