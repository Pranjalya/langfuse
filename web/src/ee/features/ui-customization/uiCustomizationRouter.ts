import { createTRPCRouter, publicProcedure } from "@/src/server/api/trpc";

export const uiCustomizationRouter = createTRPCRouter({
  get: publicProcedure.query(() => ({
    hostname: null,
    supportHref: null,
    documentationHref: "https://langfuse.com/docs",
    feedbackHref: null,
    applicationName: "Langfuse",
    logoHref: null,
  })),
});
