import { isAllowedLanDevOrigin } from "./lan-origin";

describe("LAN CORS origin contract", () => {
  it.each([
    "http://10.1.2.3:3000",
    "http://172.16.0.1:3000",
    "http://172.31.255.255:3000",
    "http://192.168.13.126:3000",
  ])("allows private LAN origin %s", (origin) => expect(isAllowedLanDevOrigin(origin)).toBe(true));

  it.each([
    "https://192.168.13.126:3000",
    "http://172.15.0.1:3000",
    "http://172.32.0.1:3000",
    "http://192.168.13.256:3000",
    "http://192.168.13.126:3001",
  ])("rejects non-contract origin %s", (origin) => expect(isAllowedLanDevOrigin(origin)).toBe(false));
});
