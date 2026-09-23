/**
 * Phase 4 gate.  Compatibility is deliberately the default because current
 * production data has not been assigned to operation groups yet.
 */
export function isOrganizationPermissionStrict(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ORG_PERMISSION_ENFORCEMENT?.trim().toLowerCase() === "strict";
}
