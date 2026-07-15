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

## EC2 Docker 데모 배포

현재 Docker 구성은 애플리케이션 데이터를 프로세스 메모리에 저장하는 데모 배포입니다. 컨테이너를 재시작하거나 새 이미지로 교체하면 가입 사용자, 프로젝트, 회의 데이터가 초기화됩니다.

EC2에 Docker Engine과 Compose 플러그인을 설치한 뒤 저장소 루트에서 실행합니다.

```bash
cp .env.docker.example .env.docker
openssl rand -base64 48
```

생성한 값을 `.env.docker`의 `SESSION_SECRET`에 넣고 `APP_URL`, AI 제공자 설정을 수정합니다. 그다음 이미지를 빌드하고 실행합니다.

```bash
docker compose -f compose.ec2.yml up -d --build
docker compose -f compose.ec2.yml ps
docker compose -f compose.ec2.yml logs -f web
```

EC2 보안 그룹에서 테스트할 클라이언트에 대해서만 TCP 3101 인바운드를 허용하면 `http://EC2_PUBLIC_IP:3101`으로 접속할 수 있습니다. 컨테이너 내부에서는 3000번 포트를 사용하고 EC2의 3101번 포트로 전달합니다. 브라우저 마이크 녹음은 HTTPS가 필요하므로 실제 녹음 테스트에는 Nginx 또는 Application Load Balancer와 인증서를 연결해야 합니다.

배포 갱신은 최신 코드를 받은 뒤 다시 빌드합니다.

```bash
git pull
docker compose -f compose.ec2.yml up -d --build
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

Gemini 모드에서는 수정된 전사 TXT가 Google Gemini API로 전송됩니다. `기존 녹음 파일 AI 분석` 또는 `방금 녹음 AI 분석`을 선택한 경우에만 원본 음성이 분석 요청 동안 Gemini로 전송되며, 앱 서버의 디스크나 DB에는 저장하지 않습니다.

## Phase 0 범위

- pnpm TypeScript 모노레포
- Next.js App Router 웹 앱
- 워커 앱
- 공유 domain, db, ai, auth, queue, storage, ui 패키지
- PostgreSQL, Redis, MinIO Docker Compose
- 웹 health endpoint와 워커 health check
- Vitest, Playwright, ESLint, TypeScript strict mode
