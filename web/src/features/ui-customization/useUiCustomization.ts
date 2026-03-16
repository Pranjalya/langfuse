/**
 * MIT-licensed fallback for UI customization.
 * In Enterprise Edition, this hook provides white-labeling and custom branding.
 * In MIT mode, it returns default values.
 */
export function useUiCustomization() {
  return {
    hostname: null,
    supportHref: null,
    documentationHref: "https://langfuse.com/docs",
    feedbackHref: null,
    applicationName: "Langfuse",
    logoHref: null,
    defaultModelAdapter: null,
    defaultBaseUrlOpenAI: null,
    defaultBaseUrlAzure: null,
    defaultBaseUrlAnthropic: null,
    logoLightModeHref: null,
    logoDarkModeHref: null,
  };
}
