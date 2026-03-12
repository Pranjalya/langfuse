import { env } from "@/src/env.mjs";

export function canCreateOrganizations(userEmail: string | null): boolean {
  // If no allowlist is set, allow all users to create organizations
  if (!env.LANGFUSE_ALLOWED_ORGANIZATION_CREATORS) {
    return true;
  }

  if (!userEmail) {
    return false;
  }

  const allowedOrgCreators =
    env.LANGFUSE_ALLOWED_ORGANIZATION_CREATORS.toLowerCase().split(",");

  return allowedOrgCreators.includes(userEmail.toLowerCase());
}
