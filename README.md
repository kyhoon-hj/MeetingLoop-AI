# MeetingLoop AI

회의 음성, 회의록, 결정, 할 일, 개발 영향 분석을 연결하는 한국어 우선 반응형 웹 플랫폼입니다.

## 로컬 실행

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## 검증

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

## Phase 0 범위

- pnpm TypeScript 모노레포
- Next.js App Router 웹 앱
- 워커 앱
- 공유 domain, db, ai, auth, queue, storage, ui 패키지
- PostgreSQL, Redis, MinIO Docker Compose
- 웹 health endpoint와 워커 health check
- Vitest, Playwright, ESLint, TypeScript strict mode
