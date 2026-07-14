# ENVIRONMENT_GUIDE.md

## Environment Configuration Guide

### Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| SERVER_PORT | No | 3001 | Backend port |
| JWT_SECRET | **Yes** | — | JWT signing key |
| JWT_EXPIRES_IN | No | 7d | Token expiry |
| DATABASE_URL | No | file:./dev.db | Database path |
| NEXT_PUBLIC_API_URL | **Yes** | http://localhost:3001/api | Frontend API URL |
| ALLOWED_ORIGINS | No | empty | Production CORS whitelist |
| NODE_ENV | No | development | Runtime environment |
| RUN_SEED | No | false | Run seed on Docker start |

### Setup

```bash
cp .env.example apps/server/.env
# Edit JWT_SECRET
```

### Generate JWT_SECRET

```bash
node -e "console.log(require("crypto").randomBytes(32).toString("hex"))"
```
