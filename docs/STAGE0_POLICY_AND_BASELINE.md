# 단계 0 정책 결정 및 기준선 기록

작성일: 2026-07-16
상태: 완료 — E2E 기준선 결함 2건 별도 추적 필요
기준 분석: `docs/LOCAL_VERSION_INTEGRATION_ANALYSIS.md`

## 1. 단계 0 결과

정책 결정 D1~D5, 실행 환경과 migration checksum 기록, 개발 인프라 기동, 빈 DB와 기존 DB migration/seed, 전체 CI, E2E 기준선, EC2 Docker build/migrator/web readiness를 확인했다.

단계 0 완료 조건은 충족했다.

- D1~D5를 현재 데이터 정책과 충돌하지 않게 확정했다.
- PostgreSQL integration test는 42개 모두 통과했고 skip은 0개다.
- EC2 production image build, migrator, web container, DB readiness를 재현했다.

E2E는 현재 기준선에서 완전 통과하지 않는다. 27개 시나리오 중 `meetings.spec.ts`의 mobile/desktop 실패 artifact가 생성됐고 runner가 종료되지 않아 제한시간을 초과했다. 이 결과는 통합으로 인한 회귀가 아니라 통합 시작 전 기준선 결함으로 기록한다.

## 2. 정책 결정 D1~D5

이 결정은 현재의 기준 문서 `docs/DATA_STORAGE_POLICY.md`를 우선 적용한다. 정책 범위를 넓히려면 구현 전에 이 결정 기록과 데이터 정책을 함께 변경해야 한다.

### D1. 원본 음성 서버 전송 및 저장

결정: 금지.

- 원본 음성, 녹음 chunk, 분리 음원을 애플리케이션 서버, DB, S3/MinIO에 전송하거나 저장하지 않는다.
- upload, playback URL, server-side analyze-file API를 추가하지 않는다.
- Gemini 등 외부 AI에도 원본 음성을 전송하지 않는다.
- 로컬 버전의 관련 route와 `ALLOW_RAW_AUDIO_SERVER_UPLOAD`는 통합 대상에서 제외한다.

### D2. 전사 초안 저장 위치

결정: raw/normalized/edited 초안은 브라우저에만 두고, 사용자가 확정한 edited transcript만 서버에 저장한다.

- raw STT 결과와 normalized draft는 IndexedDB 또는 브라우저 상태에 둔다.
- 서버 transcript API는 `CONFIRMED`와 `editedText`만 받는다.
- 서버의 optimistic version, revision, editor/confirm actor 기록을 유지한다.
- segment reprocess는 브라우저 초안을 갱신하며 최종 확정 전에는 서버 DB를 변경하지 않는다.

### D3. 파생 메타데이터 저장 범위

결정: 1차 통합에서는 현재 정책에 없는 파생 메타데이터를 서버에 영속 저장하지 않는다.

- audio quality frame/report, VAD region, overlap region, 미확정 speaker candidate/assignment, transcription candidate/run, AI evidence/review queue 초안은 브라우저에 둔다.
- 현재 정책이 허용하는 최종 전사의 확정 화자, 순서, 시작·종료 시각과 최종 회의록/revision만 PostgreSQL에 저장한다.
- 서버 기반 review queue 재개, multi-device 초안 동기화 또는 worker 재처리가 필요하면 D3를 재개정하고 보존기간·삭제·권한을 데이터 정책에 먼저 추가한다.

### D4. Redis/BullMQ worker의 1차 배포 범위

결정: worker 기반은 1차 서버 통합 범위에 포함하되 raw audio payload를 처리하지 않는다.

- text-only 분석, confirmed transcript 기반 회의록/검토, 만료/정리 같은 비음성 background job에 사용한다.
- 브라우저에서 수행할 음질/VAD/overlap 초안 처리는 worker로 보내지 않는다.
- idempotency, retry/backoff, readiness, graceful shutdown을 갖춘 뒤 EC2 compose에 포함한다.
- 현재 web 요청으로 충분한 초기 vertical slice에서는 worker 없이도 기능이 동작하도록 경계를 유지한다.

### D5. Deterministic provider와 실제 provider 표시

결정: deterministic provider는 demo/fixture/test 전용으로 표시하고 production 품질로 표현하지 않는다.

- 화면과 상태 API에서 `데모 분석`과 `실제 AI 분석`을 구분한다.
- deterministic provider는 CI, fixture, 개발 데모에 사용한다.
- production에서 실제 provider가 설정되지 않았으면 기능을 비활성화하거나 데모임을 명확히 표시한다.
- provider 상태에는 외부 전송 여부, 모델, 사용 가능 상태를 표시한다.

## 3. 소스 및 실행 환경 기준선

| 항목 | 값 |
|---|---|
| Git branch | `codex/stage2-persistence-schema` |
| Git commit | `9d3453309780b156735d1a57e1a25afd63b95f67` |
| Commit 시각 | `2026-07-15T13:45:34+09:00` |
| Commit 제목 | `chore: secure EC2 container networking` |
| Host Node.js | `v24.15.0` |
| pnpm | `11.7.0` |
| Docker CLI/engine | `29.5.3` |
| Docker Compose | `v5.1.4` |
| Dockerfile Node.js | `node:22-bookworm-slim` |
| 개발 PostgreSQL image | `postgres:16-alpine` |
| 개발 Redis image | `redis:7-alpine` |
| 개발 MinIO image | `minio/minio:RELEASE.2025-06-13T11-33-47Z` |

Host Node 24와 production image Node 22가 다르다. CI와 Docker build가 모두 통과했지만 향후 재현성을 위해 개발/CI Node를 22로 맞추는 작업을 권장한다.

## 4. 환경 변수 key 기준선

값과 비밀정보는 기록하지 않고 key만 기록한다.

### `.env.example`

```text
NODE_ENV APP_URL APP_TIMEZONE
DATABASE_URL DATABASE_SSL DB_POOL_MAX DB_CONNECTION_TIMEOUT_MS DB_IDLE_TIMEOUT_MS
REDIS_URL
STORAGE_DRIVER S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY S3_FORCE_PATH_STYLE
SESSION_SECRET
AI_MODE STT_PROVIDER DIARIZATION_PROVIDER ANALYSIS_PROVIDER EMBEDDING_PROVIDER
AI_API_KEY STT_API_KEY DIARIZATION_API_KEY
OLLAMA_HOST OLLAMA_MODEL GEMINI_API_KEY GEMINI_MODEL
MAX_UPLOAD_BYTES AUDIO_RETENTION_DAYS SIGNED_URL_TTL_SECONDS
```

### `.env.docker.example`

```text
NODE_ENV APP_URL APP_TIMEZONE
DATABASE_URL DATABASE_SSL DB_POOL_MAX DB_CONNECTION_TIMEOUT_MS DB_IDLE_TIMEOUT_MS
SESSION_SECRET STORAGE_DRIVER ANALYSIS_PROVIDER
GEMINI_API_KEY GEMINI_MODEL OLLAMA_HOST OLLAMA_MODEL
MAX_UPLOAD_BYTES AUDIO_RETENTION_DAYS SIGNED_URL_TTL_SECONDS
```

정책상 raw audio upload를 금지하므로 `MAX_UPLOAD_BYTES`, `AUDIO_RETENTION_DAYS`, `SIGNED_URL_TTL_SECONDS`와 S3 관련 key는 현재 구현에서 실제 사용 범위를 재검토해야 한다. 존재 자체를 업로드 허용으로 해석하지 않는다.

## 5. Migration checksum 기준선

| Migration | SHA-256 |
|---|---|
| `0001_phase1_auth_project.sql` | `3b36597ee97a490effbf39d4d2ccbd11609244cfd85f16bde730f1170fde7b4c` |
| `0002_stage0_data_policy.sql` | `8ba551e2660727e1fbf2732ac853894151119ad09f26ba5322a723a1cb2f3bad` |
| `0003_confirmed_content_only.sql` | `ae652e9c56fadee26cb66f4c1435bc70ab754b7f0abbd37931bf845066d2f7a3` |
| `0004_stage2_persistence_schema.sql` | `f7b647a52819d0e19d316b02dbfcf29792ed60475d759de512fdeeef5ef7a2af` |
| `0005_tenant_scope_constraints.sql` | `9abfd03212f71b7e7768d8045c832e194eb580987acac9301393e67cb56f0121` |

이 checksum을 가진 migration은 수정하지 않는다. 신규 schema는 `0006` 이후 migration으로만 추가한다.

## 6. 개발 인프라 결과와 포트 충돌

Docker Desktop을 기동하고 다음 서비스가 healthy임을 확인했다.

- `infra-postgres-1`
- `infra-redis-1`
- `infra-minio-1`

발견 사항:

- Windows에 PostgreSQL 18이 이미 `::1:5432`와 `0.0.0.0:5432`에서 실행 중이다.
- Docker PostgreSQL도 compose상 host 5432를 게시하지만, Node `pg`가 `localhost`를 `::1`로 해석해 Windows PostgreSQL 18에 연결한다.
- 첫 확인 중 `pnpm db:migrate`와 `pnpm db:seed`는 기존 Windows 로컬 DB에 연결됐다. migration은 이미 적용되어 모두 skip됐고 development seed는 idempotent하게 적용됐다.
- Docker PostgreSQL은 내부 확인 시 빈 DB였으므로 이를 빈 DB 검증 성공으로 간주하지 않았다.

권장 후속 조치:

1. Docker PostgreSQL host port를 `55432` 등으로 변경하고 개발 `DATABASE_URL`을 `127.0.0.1:55432`로 명시하거나,
2. Windows PostgreSQL을 사용할 때는 Docker PostgreSQL service를 기동하지 않는다.

`localhost` 대신 `127.0.0.1`을 사용해 IPv4/IPv6 연결 대상이 달라지는 문제를 제거해야 한다.

## 7. 빈 DB 및 기존 DB migration/seed 결과

기존 Windows DB와 분리하기 위해 `127.0.0.1:55432`에 일회용 PostgreSQL 16 container를 만들었다.

첫 실행:

- migration `0001`~`0005` 모두 apply
- seed 성공
- organizations 1, users 1, projects 1

두 번째 실행:

- migration `0001`~`0005` 모두 skip
- seed 재실행 성공
- organizations 1, users 1, projects 1 유지

결론:

- 빈 DB forward migration 성공
- 적용 완료 DB 재실행 성공
- seed idempotency 확인
- 검증용 container는 종료 및 제거함

## 8. CI 결과

격리 PostgreSQL을 `DATABASE_URL`로 지정한 `pnpm run ci` 결과:

| 검증 | 결과 |
|---|---|
| lint | 성공 |
| typecheck | 성공 |
| unit | 8 files, 27 tests 성공 |
| integration | 9 files, 42 tests 성공 |
| DB integration skip | 0 |
| workspace build | 성공 |
| Next production build | 성공 |

## 9. E2E 기준선 결과

Playwright에는 mobile/tablet/desktop 각 9개, 총 27개 시나리오가 등록되어 있다.

`pnpm test:e2e`는 약 499초 후 runner 제한시간을 초과했다. 다음 실패 artifact가 생성됐다.

1. Desktop `meetings.spec.ts`
   - 상세 페이지 navigation이 완료되지 않아 `참석자` heading을 찾지 못하고 60초 test timeout 발생
2. Mobile `meetings.spec.ts`
   - `getByRole('alert')`가 실제 오류 panel과 Next.js `__next-route-announcer__` 두 요소를 찾아 strict mode 위반

runner가 정상 요약을 출력하지 않았으므로 나머지 25개를 모두 성공으로 단정하지 않는다. E2E 기준선은 `RED`이며 통합 전 별도 안정화 작업이 필요하다.

권장 추적 작업:

- `BASE-E2E-001`: detail navigation timeout의 server log/DB pool 원인 분석
- `BASE-E2E-002`: 오류 panel locator를 구체적인 container 또는 accessible name으로 제한
- `BASE-E2E-003`: Windows에서 `scripts/run-e2e.mjs` child process 종료와 timeout 처리 개선

## 10. EC2 Docker smoke 결과

실행 결과:

- `meetingloop-ai:latest` build 성공
- `meetingloop-ai-migrator:latest` build 성공
- migrator container가 migration `0001`~`0005`를 정상 인식
- production web container 기동 성공
- host binding `127.0.0.1:3101 -> 3000` 확인
- `GET /api/health/ready` HTTP 200
- readiness 응답에서 database `status: ok` 확인
- 검증용 web container/network와 격리 DB container 정리 완료

개발용 PostgreSQL/Redis/MinIO는 단계 0 종료 시점에 healthy 상태로 유지했다.

## 11. 단계 1 진입 조건

단계 1은 시작할 수 있다. 다음 조건을 유지한다.

- D1~D5 변경은 이 문서와 `DATA_STORAGE_POLICY.md`를 함께 수정해야 한다.
- 로컬 기능 타입을 포팅해도 raw audio 또는 draft metadata를 서버 persistence에 추가하지 않는다.
- E2E 기준선 결함은 신규 통합 회귀와 구분해 추적한다.
- 정상 개발 DB 연결을 위해 PostgreSQL port/host 충돌을 먼저 정리하는 것을 권장한다.
