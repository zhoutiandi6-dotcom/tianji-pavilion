# TianJi Pavilion — Project Tree

``
├── apps/
│   ├── server/
│   │   ├── prisma/
│   │   │   ├── data/
│   │   │   ├── migrations/
│   │   │   │   ├── 20260701_milestone_a/
│   │   │   │   │   ├── migration.sql
│   │   │   ├── schema.prisma
│   │   │   ├── seed.d.ts
│   │   │   ├── seed.d.ts.map
│   │   │   ├── seed.js
│   │   │   ├── seed.js.map
│   │   │   ├── seed.ts
│   │   ├── src/
│   │   │   ├── announcement/
│   │   │   │   ├── announcement.controller.ts
│   │   │   │   ├── announcement.module.ts
│   │   │   │   ├── announcement.service.ts
│   │   │   ├── approval/
│   │   │   │   ├── approval.controller.ts
│   │   │   │   ├── approval.module.ts
│   │   │   │   ├── approval.service.ts
│   │   │   ├── attachments/
│   │   │   │   ├── dto/
│   │   │   │   ├── attachments.controller.ts
│   │   │   │   ├── attachments.module.ts
│   │   │   │   ├── attachments.service.ts
│   │   │   ├── audit/
│   │   │   │   ├── events/
│   │   │   │   ├── listeners/
│   │   │   │   ├── services/
│   │   │   │   │   ├── audit-event.service.ts
│   │   │   │   ├── audit.controller.ts
│   │   │   │   ├── audit.module.ts
│   │   │   ├── auth/
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── jwt.strategy.ts
│   │   │   ├── common/
│   │   │   │   ├── enums/
│   │   │   │   │   ├── index.ts
│   │   │   │   ├── config.module.ts
│   │   │   │   ├── error-codes.ts
│   │   │   │   ├── logger.service.ts
│   │   │   │   ├── prisma.module.ts
│   │   │   │   ├── prisma.service.ts
│   │   │   │   ├── request-id.middleware.ts
│   │   │   │   ├── response.interceptor.ts
│   │   │   │   ├── roles.decorator.ts
│   │   │   │   ├── roles.guard.ts
│   │   │   │   ├── status-calculator.service.ts
│   │   │   │   ├── unified-exception.filter.ts
│   │   │   ├── dashboard/
│   │   │   │   ├── dashboard.controller.ts
│   │   │   │   ├── dashboard.module.ts
│   │   │   ├── domain-events/
│   │   │   │   ├── index.ts
│   │   │   ├── event-bus/
│   │   │   │   ├── event-bus.module.ts
│   │   │   │   ├── event-bus.ts
│   │   │   ├── health/
│   │   │   │   ├── health.controller.ts
│   │   │   │   ├── health.module.ts
│   │   │   ├── image-tasks/
│   │   │   │   ├── dto/
│   │   │   │   │   ├── create-image-task.dto.ts
│   │   │   │   │   ├── update-image-task.dto.ts
│   │   │   │   ├── image-tasks.controller.ts
│   │   │   │   ├── image-tasks.module.ts
│   │   │   │   ├── image-tasks.service.ts
│   │   │   ├── notifications/
│   │   │   │   ├── notifications.controller.ts
│   │   │   │   ├── notifications.module.ts
│   │   │   │   ├── notifications.service.ts
│   │   │   ├── operation-log/
│   │   │   │   ├── operation-log.controller.ts
│   │   │   │   ├── operation-log.module.ts
│   │   │   │   ├── operation-log.service.ts
│   │   │   ├── requirement-types/
│   │   │   │   ├── dto/
│   │   │   │   │   ├── create-requirement-type.dto.ts
│   │   │   │   │   ├── update-requirement-type.dto.ts
│   │   │   │   ├── requirement-types.controller.ts
│   │   │   │   ├── requirement-types.module.ts
│   │   │   │   ├── requirement-types.service.ts
│   │   │   ├── roles-permissions/
│   │   │   │   ├── roles-permissions.controller.ts
│   │   │   │   ├── roles-permissions.module.ts
│   │   │   │   ├── roles-permissions.service.ts
│   │   │   ├── stores/
│   │   │   │   ├── dto/
│   │   │   │   │   ├── create-store.dto.ts
│   │   │   │   │   ├── update-store.dto.ts
│   │   │   │   ├── stores.controller.ts
│   │   │   │   ├── stores.module.ts
│   │   │   │   ├── stores.service.ts
│   │   │   ├── system-config/
│   │   │   │   ├── system-config.controller.ts
│   │   │   │   ├── system-config.module.ts
│   │   │   │   ├── system-config.service.ts
│   │   │   ├── tasks/
│   │   │   │   ├── dto/
│   │   │   │   │   ├── create-task.dto.ts
│   │   │   │   │   ├── query-task.dto.ts
│   │   │   │   │   ├── update-task.dto.ts
│   │   │   │   ├── tasks.controller.ts
│   │   │   │   ├── tasks.module.ts
│   │   │   │   ├── tasks.service.ts
│   │   │   ├── timeline/
│   │   │   │   ├── timeline.controller.ts
│   │   │   │   ├── timeline.module.ts
│   │   │   │   ├── timeline.service.ts
│   │   │   ├── users/
│   │   │   │   ├── dto/
│   │   │   │   │   ├── create-user.dto.ts
│   │   │   │   │   ├── update-user.dto.ts
│   │   │   │   ├── users.controller.ts
│   │   │   │   ├── users.module.ts
│   │   │   │   ├── users.service.ts
│   │   │   ├── workflow-engine/
│   │   │   │   ├── actions/
│   │   │   │   │   ├── index.ts
│   │   │   │   ├── activities/
│   │   │   │   │   ├── index.ts
│   │   │   │   ├── engine/
│   │   │   │   │   ├── index.ts
│   │   │   │   ├── events/
│   │   │   │   ├── services/
│   │   │   │   ├── state-machine/
│   │   │   │   │   ├── index.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── workflow-engine.module.ts
│   │   │   ├── workflow-history/
│   │   │   │   ├── workflow-history.module.ts
│   │   │   │   ├── workflow-history.service.ts
│   │   │   ├── workflow-notification/
│   │   │   │   ├── workflow-notification.module.ts
│   │   │   │   ├── workflow-notification.service.ts
│   │   │   ├── app.module.ts
│   │   │   ├── main.ts
│   │   ├── uploads/
│   │   │   ├── .gitkeep
│   │   ├── docker-entrypoint.sh
│   │   ├── Dockerfile
│   │   ├── init-quick.js
│   │   ├── nest-cli.json
│   │   ├── package.json
│   │   ├── tsconfig.json
│   ├── web/
│   │   ├── public/
│   │   │   ├── favicon.svg
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── change-password/
│   │   │   │   │   ├── page.tsx
│   │   │   │   ├── dashboard/
│   │   │   │   │   ├── fazhi/
│   │   │   │   │   ├── notifications/
│   │   │   │   │   ├── requirement-types/
│   │   │   │   │   ├── settings/
│   │   │   │   │   ├── stores/
│   │   │   │   │   ├── users/
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── page.tsx
│   │   │   │   ├── login/
│   │   │   │   │   ├── page.tsx
│   │   │   │   ├── setup/
│   │   │   │   │   ├── page.tsx
│   │   │   │   ├── globals.css
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   ├── components/
│   │   │   │   ├── timeline/
│   │   │   │   │   ├── WorkflowTimeline.tsx
│   │   │   │   ├── BreadcrumbNav.tsx
│   │   │   │   ├── EmptyState.tsx
│   │   │   │   ├── ErrorBoundary.tsx
│   │   │   │   ├── GlobalSearch.tsx
│   │   │   │   ├── Loading.tsx
│   │   │   ├── lib/
│   │   │   │   ├── context/
│   │   │   │   │   ├── theme.tsx
│   │   │   │   ├── hooks/
│   │   │   │   │   ├── useAutoSave.ts
│   │   │   │   ├── api.ts
│   │   │   │   ├── notify.ts
│   │   │   │   ├── theme.ts
│   │   ├── Dockerfile
│   │   ├── next-env.d.ts
│   │   ├── next.config.js
│   │   ├── package.json
│   │   ├── tsconfig.json
├── docs/
│   ├── adr/
│   │   ├── ADR-008-Workflow-Timeline.md
│   ├── deployment/
│   │   ├── README.md
├── packages/
│   ├── config/
│   │   ├── src/
│   │   │   ├── eslint.js
│   │   │   ├── index.js
│   │   ├── package.json
│   │   ├── tsconfig.json
│   ├── types/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   ├── ui/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
├── scripts/
│   ├── backup.sh
│   ├── restore.sh
├── tests/
├── .dockerignore
├── .env.example
├── .eslintrc.cjs
├── .gitignore
├── .prettierrc
├── ARCHITECTURE_DECISIONS.md
├── CODE_REVIEW_INFO.md
├── docker-compose.yml
├── package-lock.json
├── package.json
├── README.md
├── server.log
├── start.bat
├── TECHNICAL_DEBT.md
├── tsconfig.base.json
├── 天机阁_V1_Codex开发任务书.docx
``

