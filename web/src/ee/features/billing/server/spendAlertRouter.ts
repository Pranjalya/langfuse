import { createTRPCRouter, publicProcedure } from "@/src/server/api/trpc";

export const spendAlertRouter = createTRPCRouter({
  get: publicProcedure.query(() => null),
});
