import type { MembershipRole } from "@paperclipai/shared";

declare global {
  namespace Express {
    interface Request {
      actor: {
        type: "none" | "board" | "agent" | string;
        source?: "local_implicit" | string;
        userId?: string | null;
        agentId?: string | null;
        companyId?: string | null;
        runId?: string | null;
        isInstanceAdmin?: boolean;
        companyIds?: string[];
        memberships?: Array<{
          companyId: string;
          status?: string | null;
          membershipRole?: MembershipRole | string | null;
        }>;
        [key: string]: unknown;
      };
    }
  }
}

export {};
