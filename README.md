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

## 무료 AI 회의록

회의록 생성은 데모 문구가 아닌 실제 AI 제공자를 사용합니다. 기본값은 원본 음성과 전사 TXT를 외부 AI에 보내지 않는 Ollama 로컬 모드입니다.

### Ollama 로컬 무료 모드

1. Windows용 Ollama를 설치합니다.
2. 로컬 모델을 준비합니다.

```bash
ollama pull qwen3:4b
```

3. Ollama를 실행한 상태에서 웹 화면의 `연결 다시 확인`을 누릅니다.

기본 설정은 `OLLAMA_HOST=http://127.0.0.1:11434`, `OLLAMA_MODEL=qwen3:4b`입니다.

### Gemini 무료 모드

`apps/web/.env.local`에 다음 값을 설정하고 웹 서버를 다시 시작합니다.

```dotenv
ANALYSIS_PROVIDER=gemini
GEMINI_API_KEY=발급받은_API_키
GEMINI_MODEL=gemini-3.1-flash-lite
```

Gemini 모드에서는 수정된 전사 TXT가 Google Gemini API로 전송됩니다. 원본 음성은 전송하지 않습니다.

## Phase 0 범위

- pnpm TypeScript 모노레포
- Next.js App Router 웹 앱
- 워커 앱
- 공유 domain, db, ai, auth, queue, storage, ui 패키지
- PostgreSQL, Redis, MinIO Docker Compose
- 웹 health endpoint와 워커 health check
- Vitest, Playwright, ESLint, TypeScript strict mode
