import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import { type IncomingHttpHeaders } from "http";
import { type NextApiRequest, type NextApiResponse } from "next";

export interface AdminAuthResult {
  isAuthorized: boolean;
  error?: string;
}

export interface AdminAuthOptions {
  isAllowedOnLangfuseCloud?: boolean;
}

const isBlockedOnCloud = (options: AdminAuthOptions): boolean => {
  const { isAllowedOnLangfuseCloud = false } = options;
  if (isAllowedOnLangfuseCloud) return false;

  const region = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  // In cloud deployments, block by default (except DEV/CI-like environments)
  return Boolean(region && region !== "DEV");
};

const verifyBearerToken = (
  authHeader: string,
  expectedToken: string,
): AdminAuthResult => {
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token || token !== expectedToken) {
    return { isAuthorized: false, error: "Unauthorized: Invalid token" };
  }
  return { isAuthorized: true };
};

export class AdminApiAuthService {
  static verifyAdminAuthFromAuthString = (
    authString: string,
    options: AdminAuthOptions = {},
  ): AdminAuthResult => {
    if (isBlockedOnCloud(options)) {
      return { isAuthorized: false, error: "Not accessible on Langfuse Cloud" };
    }

    const adminKey = env.ADMIN_API_KEY;
    if (!adminKey) {
      logger.error("ADMIN_API_KEY is not set");
      return { isAuthorized: false, error: "ADMIN_API_KEY is not set" };
    }

    return verifyBearerToken(authString, adminKey);
  };

  private static verifyAdminAuthFromHeader(
    headers: IncomingHttpHeaders,
    options: AdminAuthOptions = {},
  ): AdminAuthResult {
    const authString = headers.authorization;
    if (!authString) {
      return {
        isAuthorized: false,
        error: "Unauthorized: No authorization header provided",
      };
    }
    return AdminApiAuthService.verifyAdminAuthFromAuthString(
      authString,
      options,
    );
  }

  public static handleAdminAuth(
    req: NextApiRequest,
    res: NextApiResponse,
    options: AdminAuthOptions = {},
  ): boolean {
    const result = AdminApiAuthService.verifyAdminAuthFromHeader(
      req.headers,
      options,
    );

    if (!result.isAuthorized) {
      const message = result.error ?? "Unauthorized";
      const is401 = message.startsWith("Unauthorized");
      res.status(is401 ? 401 : 403).json({ error: message });
      return false;
    }

    return true;
  }
}
