import { PILOT_REGION } from "./aws-inspection";

export const FOUNDATION_STACK = "abasong-pilot-dev-foundation";
export const DEPLOYER_ROLE = "abasong-pilot-dev-deployer";

// A root or plain IAM login can inspect the account but cannot provision here.
// The role's actual IAM policy remains the independent authorization boundary.
export function assertFoundationIdentity(
  identity: Record<string, unknown>,
  expectedAccount: string,
  region: string,
) {
  if (
    !/^\d{12}$/.test(expectedAccount) ||
    region !== PILOT_REGION ||
    identity.Account !== expectedAccount ||
    typeof identity.Arn !== "string" ||
    !new RegExp(
      `^arn:aws:sts::${expectedAccount}:assumed-role/${DEPLOYER_ROLE}/[A-Za-z0-9_+=,.@-]{2,64}$`,
    ).test(identity.Arn)
  )
    throw new Error("Verified pilot foundation role required");
}
