const PRIVATE_LAN_ORIGIN = /^http:\/\/(10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}):3000$/;

export function isAllowedLanDevOrigin(origin: string): boolean {
  const match = PRIVATE_LAN_ORIGIN.exec(origin);
  const host = match?.[1];
  return Boolean(host && host.split(".").every((segment) => Number(segment) >= 0 && Number(segment) <= 255));
}
