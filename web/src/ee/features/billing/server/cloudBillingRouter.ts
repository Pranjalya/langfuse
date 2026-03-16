import { createTRPCRouter, publicProcedure } from "@/src/server/api/trpc";

export const cloudBillingRouter = createTRPCRouter({
  get: publicProcedure.query(() => null),
});
