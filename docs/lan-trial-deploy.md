# TianJi Pavilion LAN Trial Deploy Guide

This guide is for local LAN trial only. Do not use this as an internet-facing production deployment plan.

## 1. Start Backend

From the project root:

```bash
npm run dev:server:lan
```

Or from `apps/server` after build:

```bash
npm run start:lan -w @tianji/server
```

Backend listens on:

```text
http://0.0.0.0:3001/api
```

Other computers must use your LAN IP instead of `0.0.0.0`, for example:

```text
http://192.168.1.23:3001/api
```

## 2. Start Frontend

From the project root:

```bash
npm run dev:web:lan
```

Equivalent direct command:

```bash
npm run dev -w @tianji/web -- --hostname 0.0.0.0
```

Frontend listens on:

```text
http://0.0.0.0:3000
```

Other computers should visit:

```text
http://192.168.1.23:3000
```

Replace `192.168.1.23` with your computer's actual LAN IP.

## 3. Find Your LAN IP on Windows

Run in PowerShell:

```powershell
ipconfig
```

Find the active Wi-Fi or Ethernet adapter and copy the `IPv4 Address`, commonly like:

```text
192.168.1.23
```

You can also run:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" } | Select-Object IPAddress,InterfaceAlias
```

## 4. Configure Frontend API URL

Create or update:

```text
apps/web/.env.local
```

Example:

```env
NEXT_PUBLIC_API_URL=http://192.168.1.23:3001/api
```

Important:

- Do not use `http://localhost:3001/api` for LAN trial, because on another computer `localhost` means that other computer itself.
- Restart the frontend dev server after changing `.env.local`.
- If your LAN IP changes, update `.env.local` and restart the frontend.

## 5. Backend CORS

Development CORS allows:

```text
http://localhost:3000
http://127.0.0.1:3000
http://192.168.*.*:3000
```

If your LAN uses a different private range, add it explicitly through backend env:

```env
DEV_ALLOWED_ORIGINS=http://10.0.0.23:3000
```

Production should use explicit `ALLOWED_ORIGINS` and should not broadly expose development origins.

## 6. Windows Firewall

If another computer cannot open the page, allow Node.js or the ports in Windows Defender Firewall.

Recommended trial ports:

```text
3000 frontend
3001 backend API
```

You can allow the app when Windows prompts for Node.js network access, or create inbound firewall rules for TCP ports `3000` and `3001` on private networks.

## 7. Other Computers Access

On another computer in the same Wi-Fi/LAN, open:

```text
http://192.168.1.23:3000
```

Login with the trial accounts listed in `docs/trial-guide.md`.

## 8. Troubleshooting

### Page cannot open

- Confirm frontend is started with `npm run dev:web:lan`.
- Confirm the URL uses your LAN IP, not `0.0.0.0`.
- Confirm both computers are on the same Wi-Fi/LAN.
- Check Windows Firewall for port `3000`.

### Page opens but login fails

- Confirm backend is started with `npm run dev:server:lan`.
- Open `http://192.168.1.23:3001/api/health` if a health endpoint exists, or check backend terminal logs.
- Confirm `apps/web/.env.local` uses `NEXT_PUBLIC_API_URL=http://192.168.1.23:3001/api`.
- Restart frontend after editing `.env.local`.

### Page opens but API requests fail

- Check browser DevTools Network tab for request URL.
- If requests still go to `localhost`, `.env.local` is not configured or frontend was not restarted.
- If requests are blocked by CORS, confirm frontend origin is `http://192.168.*.*:3000` or add it to `DEV_ALLOWED_ORIGINS`.
- Check Windows Firewall for port `3001`.

### IP changes and access fails

- Run `ipconfig` again.
- Update `apps/web/.env.local`.
- Restart frontend.
- Use the new URL on other computers.

### Computers are not in the same Wi-Fi/LAN

- LAN trial only works when devices can reach each other on the same network.
- Guest Wi-Fi, mobile hotspot isolation, company network isolation, or different routers may block access.
- Move both devices to the same trusted private network, then retry.

