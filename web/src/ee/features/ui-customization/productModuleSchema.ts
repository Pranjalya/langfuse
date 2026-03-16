import { z } from "zod/v4";

export const productModuleSchema = z.enum([
  "tracing",
  "dashboards",
  "prompt-management",
  "evaluation",
  "datasets",
  "playground",
]);

export type ProductModule = z.infer<typeof productModuleSchema>;
