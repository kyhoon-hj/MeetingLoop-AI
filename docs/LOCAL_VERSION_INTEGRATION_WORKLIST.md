# 로컬 기능 버전 통합 작업 목록

기준 문서: `docs/LOCAL_VERSION_INTEGRATION_ANALYSIS.md`
원칙: 현재 서버 버전을 기준으로 기능을 세로 단위(vertical slice)로 포팅한다.

단계 0 결과: `docs/STAGE0_POLICY_AND_BASELINE.md`

## 1. 작업 규칙

- [ ] 로컬 프로젝트 전체를 현재 프로젝트에 덮어쓰지 않는다.
- [ ] 기존 `packages/db/migrations/0001`~`0005`를 수정하지 않는다.
- [ ] `Demo` repository를 production API나 worker에서 사용하지 않는다.
- [ ] 모든 DB query와 mutation에 organization scope를 포함한다.
- [ ] 모든 mutation에 actor 권한과 version 또는 idempotency를 적용한다.
- [ ] raw audio 정책 결정 전 upload/playback/analyze-file route를 추가하지 않는다.
- [ ] 한 PR은 하나의 검증 가능한 vertical slice를 목표로 한다.
- [ ] 각 slice는 domain test, repository integration test, API test, 필요한 UI/E2E를 함께 포함한다.

## 2. 단계 및 의존 관계

| 단계 | 목표 | 선행 조건 | 완료 게이트 |
|---|---|---|---|
| 0 | 정책과 기준선 고정 | 없음 | D1~D5 기록, baseline 재현 |
| 1 | 도메인 계약 통합 | 단계 0 | 양쪽 기존 test와 신규 contract test 통과 |
| 2 | PostgreSQL schema/repository | 단계 1 | migration 및 tenant/persistence test 통과 |
| 3 | meeting-scoped API | 단계 2 | auth/version/idempotency test 통과 |
| 4 | 브라우저 녹음/음질 UI | 단계 1, 일부 단계 3 | 모바일/오프라인 E2E 통과 |
| 5 | 화자/사전/검토 UI | 단계 3 | review E2E와 reload persistence 통과 |
| 6 | worker/queue/배포 | 단계 2~3 | Docker compose에서 web+worker readiness 성공 |
| 7 | 보안/보존/운영 | 단계 4~6 | 정책, 삭제, 권한, 로그 검증 |
| 8 | 회귀/릴리스 | 전체 | CI, DB integration, E2E, Docker smoke 성공 |

## 3. 단계 0 — 정책과 기준선

### P0 결정 작업

- [x] `INT-0001` D1: 원본 음성의 서버 전송/저장 허용 범위를 승인한다.
- [x] `INT-0002` D2: raw/normalized/edited transcript의 저장 위치와 보존 기간을 승인한다.
- [x] `INT-0003` D3: audio quality, voice/overlap region, speaker assignment, evidence 등 파생 메타데이터의 서버 저장 범위를 승인한다.
- [x] `INT-0004` D4: Redis/BullMQ worker를 1차 배포 범위에 포함할지 승인한다.
- [x] `INT-0005` D5: deterministic demo와 실제 provider의 사용자 표시 문구 및 활성화 조건을 정한다.

### P0 기준선 작업

- [x] `INT-0010` 현재 branch/commit, Node/pnpm, env key, migration checksum 목록을 릴리스 노트에 기록한다.
- [x] `INT-0011` PostgreSQL/Redis/MinIO가 있는 개발 환경을 기동한다.
- [x] `INT-0012` `pnpm db:migrate`, `pnpm db:seed`를 빈 DB와 기존 migration 적용 DB에서 각각 검증한다.
- [x] `INT-0013` `pnpm run ci`와 `pnpm test:e2e`의 실제 기준 결과를 저장한다.
- [x] `INT-0014` `docker compose -f compose.ec2.yml build/run/up` smoke test 결과를 저장한다.

완료 조건:

- D1~D5가 문서화되어 구현자가 임의로 개인정보 정책을 해석할 여지가 없다.
- 현재의 PostgreSQL 통합 테스트 38개가 skip 없이 통과한다.
- 현재 Docker 배포 흐름이 변경 전에도 재현된다.

## 4. 단계 1 — 도메인 및 provider 계약 통합

### P0

- [x] `INT-0101` 로컬의 audio quality, artifact, VAD, overlap schema/type을 현재 domain package에 포팅한다.
- [x] `INT-0102` speaker cluster/assignment/history schema/type을 포팅한다.
- [x] `INT-0103` transcription run/candidate/alignment/word schema/type을 포팅한다.
- [x] `INT-0104` dictionary/edit history schema/type을 포팅한다.
- [x] `INT-0105` extracted item/evidence/review queue schema/type과 안전 규칙을 포팅한다.
- [x] `INT-0106` 현재의 confirmed transcript/minutes/version schema를 보존하고 신규 타입과 이름 충돌을 해소한다.
- [x] `INT-0107` `packages/domain/src/review-loop.test.ts`를 현재 모델에 맞게 옮기고 tenant/version 관련 negative case를 추가한다.

### P1 구조 개선

- [x] `INT-0110` 비대해진 `packages/domain/src/index.ts`를 audio, transcript, review, minutes 영역 module로 분리하고 public export는 호환되게 유지한다.
- [x] `INT-0111` AI provider capability를 `demo`, `real`, `requiresAudioUpload`, `supportsServerPersistence`, `externalTransmission`처럼 명시적으로 표현한다.
- [x] `INT-0112` deterministic provider test와 real provider contract test를 구분한다.

완료 조건:

- 현재 27개 unit test가 유지된다.
- 로컬의 domain/AI 안전 규칙 test가 현재 코드에서 통과한다.
- HIGH overlap, unconfirmed speaker, 불충분 evidence가 자동 확정되지 않는다.

## 5. 단계 2 — PostgreSQL schema 및 repository

### P0 migration 설계

- [x] `INT-0201` 로컬 `infra/migrations/0002_single_mic_audio_quality.sql`을 그대로 복사하지 않고 현재 schema 기준으로 재설계한다.
- [x] `INT-0202` 승인된 정책에 따라 `0006_single_mic_processing_schema.sql`을 추가한다.
- [x] `INT-0203` organization/project/meeting/segment 참조에 FK와 복합 tenant 제약을 추가한다. 파생 recording 참조는 D1~D3에 따라 생성하지 않는다.
- [x] `INT-0204` 기존 시간/version 제약을 유지하고 enum/check 및 mutation idempotency 제약을 추가한다. confidence/selected run은 D3 제외 대상이다.
- [x] `INT-0205` 확정 콘텐츠의 삭제 cascade/restrict와 mutation receipt retention index를 정의한다.
- [x] `INT-0206` 현재 `transcripts`/`transcript_segments` 구조와 raw/normalized 비저장 정책을 반영한다.
- [x] `INT-0207` 빈 DB migration과 `0001`~`0005`가 적용된 DB의 forward migration을 검증한다.

### P0 repository 구현

- [x] `INT-0220` audio quality report repository는 D3에 따라 서버 미구현 대상으로 확정하고 table 부재 test를 추가한다.
- [x] `INT-0221` normalization artifact, VAD, overlap repository는 D1~D3에 따라 서버 미구현 대상으로 확정한다.
- [x] `INT-0222` speaker cluster/assignment/history repository는 D3에 따라 서버 미구현 대상으로 확정한다.
- [x] `INT-0223` transcription run/candidate/word/selection repository는 D2~D3에 따라 서버 미구현 대상으로 확정한다.
- [x] `INT-0224` dictionary/application/edit history repository는 D3에 따라 서버 미구현 대상으로 확정한다.
- [x] `INT-0225` extracted item/evidence/review event/queue repository는 D3에 따라 서버 미구현 대상으로 확정한다.
- [x] `INT-0226` 현재의 `withTransaction`, membership/role guard, organization scope 패턴을 확정 전사/회의록 mutation에 적용한다.
- [x] `INT-0227` 로컬 `saveDemo*`, `getDemo*`에 의존하지 않는 `saveTranscript`/`saveMinutes` production API에 idempotency 옵션을 추가한다.

### P0 integration test

- [x] `INT-0240` DB pool 재시작 후 확정 전사/회의록 데이터가 유지되는지 검증한다.
- [x] `INT-0241` 다른 organization ID로 확정 콘텐츠 조회와 직접 FK 우회 저장이 불가능한지 검증한다.
- [x] `INT-0242` stale version과 중복 idempotency key가 데이터를 덮어쓰거나 중복 생성하지 않는지 검증한다.
- [x] `INT-0243` migration checksum 변경 감지와 partial failure rollback을 검증한다.

완료 조건:

- production 경로에서 `Demo` repository import가 0개다.
- 모든 신규 테이블에 소유권, FK, 삭제 정책, 주요 index가 있다.
- 조직 간 접근 negative test와 재시작 persistence test가 통과한다.

## 6. 단계 3 — Meeting-scoped API

### P0 공통 API 규칙

- [x] `INT-0301` 모든 보호 route에서 현재 `getSessionPayload()`의 DB membership 재검증을 사용한다.
- [x] `INT-0302` `meetingId`, `organizationId`, actor role을 route와 repository에서 다시 검증한다.
- [x] `INT-0303` body size 제한, Zod parsing, 안전한 오류 코드/로그를 적용한다.
- [x] `INT-0304` 확정 전사/회의록 mutation에 expected version과 선택적 idempotency key를 적용한다.
- [x] `INT-0305` 현재 transcript/minutes meeting-scoped API와 호환 route를 유지한다.

### P0 기능 API 포팅

- [x] `INT-0310` audio quality는 D3 및 단계 4 browser preflight 범위로 확정하고 서버 route 부재 test를 추가한다.
- [x] `INT-0311` normalization은 D1~D3에 따라 browser-only로 확정하고 서버 route를 생성하지 않는다.
- [x] `INT-0312` VAD는 D3에 따라 browser-only로 확정하고 서버 route를 생성하지 않는다.
- [x] `INT-0313` overlap은 D3에 따라 browser-only로 확정하고 서버 route를 생성하지 않는다.
- [x] `INT-0314` diarization은 D3에 따라 browser-only로 확정하고 서버 route를 생성하지 않는다.
- [x] `INT-0315` quick/precise candidate/transcription API는 D2~D3에 따라 서버 포팅 대상에서 제외한다.
- [x] `INT-0316` speaker GET/assign/merge/split API는 D3에 따라 서버 포팅 대상에서 제외한다.
- [x] `INT-0317` project dictionary CRUD/import/apply API는 D3에 따라 서버 포팅 대상에서 제외한다.
- [x] `INT-0318` transcript segment reprocess/edit history API는 브라우저 draft 갱신으로 확정하고 서버 route를 생성하지 않는다.
- [x] `INT-0319` meeting analysis/review queue와 evidence API는 D3에 따라 서버 포팅 대상에서 제외한다.

### 정책 게이트 API

- [x] `INT-0330` D1이 금지이므로 recording upload 설계와 threat model 구현을 시작하지 않는다.
- [x] `INT-0331` D1 금지에 따라 chunk upload/playback/storage 구현을 제외한다.
- [x] `INT-0332` upload/playback/analyze-file route가 존재하지 않음을 data-policy test로 유지한다.
- [x] `INT-0333` `/api/test/reset`이 source와 production artifact에 존재하지 않음을 검증한다.

완료 조건:

- 모든 API가 unauthenticated, viewer mutation, cross-tenant, malformed/oversized, stale version을 통제된 오류로 거부한다.
- API 응답이 server restart 후 같은 상태를 반환한다.

## 7. 단계 4 — 브라우저 녹음 및 음질 UI

### P0 첫 vertical slice

- [x] `INT-0401` 현재 `RecordingPanel`의 version/error/persistence orchestration을 보존한다.
- [x] `INT-0402` 로컬의 5초 microphone preflight를 독립 hook/component로 포팅한다.
- [x] `INT-0403` 입력 level, clipping, 저음량, 무음, 소음 상태와 접근성 문구를 포팅한다.
- [x] `INT-0404` IndexedDB 임시 저장과 오프라인 지속 녹음을 포팅한다.
- [x] `INT-0405` 모바일 AAC 및 local chunk storage 실패 fallback을 포팅한다.
- [x] `INT-0406` 원본 오디오가 서버로 전송되지 않는다는 network E2E를 유지한다.
- [x] `INT-0407` 음질 리포트 UI를 현재 meeting ID와 연결한다.

### P1 component 분리

- [x] `INT-0420` recording controller, audio quality panel, transcript editor를 분리한다.
- [x] `INT-0421` 공통 API client에서 version conflict, retry, abort, offline 상태를 처리한다.
- [x] `INT-0422` 3,000줄 이상의 단일 component로 회귀하지 않도록 module 경계를 정한다.

완료 조건:

- 현재 simplified workbench E2E와 로컬 microphone/offline/mobile E2E가 함께 통과한다.
- 회의 생성·목록·상세·revision navigation이 유지된다.

## 8. 단계 5 — 화자, 사전, 전사, 검토 UI

### P0

- [x] `INT-0501` speaker review panel과 assign/merge/split을 포팅한다.
- [x] `INT-0502` raw/normalized/edited 표시를 승인된 D2 저장 정책에 맞게 구현한다.
- [x] `INT-0503` 낮은 confidence, overlap, unconfirmed speaker 표시를 포팅한다.
- [x] `INT-0504` dictionary CRUD/import/apply와 적용 이력을 포팅한다.
- [x] `INT-0505` segment reprocess와 수정 이력을 현재 transcript revision과 연결한다.
- [x] `INT-0506` extracted item/evidence review queue를 포팅한다.
- [x] `INT-0507` 중요한 결정은 evidence와 speaker 검토 전 승인할 수 없게 한다.
- [x] `INT-0508` 같은 브라우저 reload에서 검토 초안을 복원하고, 다른 브라우저에는 D3에 따라 서버 확정 전사/회의록만 유지됨을 검증한다.

### P1

- [x] `INT-0520` 반복 재생과 구간 재생 UX를 구현한다.
- [x] `INT-0521` 전사 찾기/바꾸기, 사전 제안, 대량 적용의 version conflict 전략을 구현한다.
- [x] `INT-0522` 40개 초과 segment의 virtual window와 overscan 계산을 구현하고 대량 입력 unit test로 검증한다.

완료 조건:

- speaker/dictionary/review queue의 브라우저 E2E와 확정 전사/회의록의 PostgreSQL 통합 test가 함께 통과한다.
- HIGH-risk 결정 자동 확정은 domain 계약과 브라우저 UI에서 차단한다. D3상 review 전용 서버 API는 만들지 않는다.

## 9. 단계 6 — Queue, worker, 실제 분석 provider, 배포

### P0 Queue/worker

- [x] `INT-0601` BullMQ queue contract와 meeting/type/transcript version/provider 기반 idempotent job ID를 포팅한다.
- [x] `INT-0602` worker의 `Demo` repository 의존을 제거하고 권한이 재검증된 PostgreSQL confirmed transcript service로 교체한다.
- [x] `INT-0603` worker package에 직접 사용하는 domain, DB, AI, queue dependency를 선언한다.
- [x] `INT-0604` web이 직접 사용하는 queue workspace dependency를 manifest와 Next build 설정에 선언한다.
- [x] `INT-0605` graceful shutdown, 3회 exponential retry/backoff, 실패 보존·안전 로그, timeout을 구현한다.
- [x] `INT-0606` worker readiness와 queue waiting/active/delayed/failed/completed/lag 상태를 추가한다.

### P0 Docker/EC2

- [x] `INT-0620` Dockerfile에 non-root CommonJS worker build/runner target과 healthcheck를 추가한다.
- [x] `INT-0621` `compose.ec2.yml`에 AOF Redis와 worker 연결을 추가한다.
- [x] `INT-0622` migration 성공 후 Redis → worker/web을 기동하는 배포 순서를 정의한다.
- [x] `INT-0623` web의 `127.0.0.1:3101` 바인딩과 Nginx/HTTPS 원칙을 유지한다.
- [x] `INT-0624` web readiness와 worker startup이 동일한 `0006_single_mic_processing_schema.sql`을 요구하도록 guard를 추가한다.
- [x] `INT-0625` worker 실패가 web readiness를 내리지 않되 `/api/ai/status`와 UI에는 queue 상태로 표시되게 한다.

### P1 실제 provider

- [x] `INT-0640` D1~D3에 따라 서버 FFmpeg 변환을 포팅하지 않고 browser-only 녹음 codec/fallback 경계를 유지한다. 정책 변경 전에는 서버 오디오 변환을 활성화하지 않는다.
- [x] `INT-0641` 1차 실제 provider 범위를 confirmed-text 회의록용 Ollama/Gemini로 확정하고 adapter contract test를 유지한다. VAD/OSD/diarization/STT는 서버 오디오 금지 정책으로 보류한다.
- [x] `INT-0642` deterministic provider를 개발·CI demo/fixture 전용으로 제한하고 production에서 거부한다.
- [x] `INT-0643` provider 비용, 예상 latency, 품질, 개인정보 외부 전송 여부를 상태 API와 UI에 노출한다.

완료 조건:

- Docker 환경에서 migration → web → worker가 순서대로 준비된다.
- 중복 job 제출과 worker 재시작이 중복 결과를 만들지 않는다.
- provider 실패 시 기존 confirmed 데이터가 손상되지 않는다.

단계 6 결과 및 배포·장애 인계: `docs/STAGE6_QUEUE_WORKER_PROVIDER_DEPLOYMENT.md`

## 10. 단계 7 — 보안, 개인정보, 보존, 운영

### P0

- [x] `INT-0701` `docs/DATA_STORAGE_POLICY.md`를 D1~D3와 실제 `0007` schema/API에 맞게 갱신한다.
- [x] `INT-0702` 녹음 동의 시점, actor, 정책 버전과 idempotent 감사 이벤트를 저장한다.
- [x] `INT-0703` organization/project/meeting 권한 matrix와 API별 role/guard를 문서화한다.
- [x] `INT-0704` server/browser 데이터별 retention, worker purge sweep, 30일 유예 전체 회의 삭제를 구현한다.
- [x] `INT-0705` 민감 텍스트, API key, signed URL, 오디오 내용이 안전 로그에 남지 않는지 검증한다.
- [x] `INT-0706` Gemini로 전송되는 confirmed transcript 범위를 UI에서 고지하고 실행 직전 동의를 강제한다.
- [x] `INT-0707` cross-tenant, IDOR, oversized body, replay, stale role, disabled membership negative test를 유지·확장한다.
- [x] `INT-0708` DB custom backup/checksum/격리 restore/migration 복구 절차를 구현하고 검증한다.

완료 조건:

- 문서의 저장 정책, DB schema, API route, UI 문구, integration test가 서로 일치한다.
- disabled membership 및 role 변경이 기존 세션에 즉시 반영된다.

단계 7 결과와 운영 인계: `docs/STAGE7_SECURITY_PRIVACY_OPERATIONS.md`

## 11. 단계 8 — 회귀 및 릴리스

### P0 자동 검증

- [x] `INT-0801` lint
- [x] `INT-0802` typecheck
- [x] `INT-0803` unit test
- [x] `INT-0804` PostgreSQL integration test — skip 0개
- [x] `INT-0805` Redis queue integration test
- [x] `INT-0806` Playwright desktop/mobile E2E
- [x] `INT-0807` production build
- [x] `INT-0808` Docker image build 및 compose smoke
- [x] `INT-0809` migration을 실제 운영 DB 복제본에 dry run

### P0 수동 인수

- [ ] `INT-0820` 회원가입/로그인/권한 변경/비활성화
- [ ] `INT-0821` 프로젝트와 회의 생성, 검색, 상세 조회
- [ ] `INT-0822` 마이크 권한 거부/허용, 5초 검사, 녹음, 오프라인 복구
- [ ] `INT-0823` 전사 확정과 동시 편집 version conflict
- [ ] `INT-0824` 화자 지정/병합/분할과 이력
- [ ] `INT-0825` 사전 import/apply와 원문 보존
- [ ] `INT-0826` HIGH overlap 결정의 evidence 검토/승인/반려
- [ ] `INT-0827` worker/provider/Redis/DB 실패와 재시도
- [x] `INT-0828` web/worker 재시작 후 데이터 유지
- [ ] `INT-0829` Nginx HTTPS 경유 마이크 및 API 동작

완료 조건:

- 모든 P0 항목이 완료되고 알려진 제한은 릴리스 노트에 명시된다.
- 기존 서버 기능과 신규 로컬 기능의 acceptance test가 같은 build에서 통과한다.
- 배포 후 `/api/health/ready`, worker readiness, 핵심 사용자 시나리오가 정상이다.

자동 검증과 로컬 production-like PostgreSQL 16/Redis Compose 리허설 결과는 `docs/STAGE8_RELEASE_READINESS.md`에 기록한다. `INT-0809`와 수동 인수는 실제 운영 복제본·HTTPS 도메인에서 완료해야 한다.

## 12. 권장 첫 구현 묶음

리스크가 가장 낮고 현재 개인정보 정책을 바꾸지 않는 첫 묶음은 다음과 같다.

1. domain의 audio quality 계약과 fixture test 포팅
2. 브라우저 5초 입력 테스트와 음질 안내 UI 포팅
3. IndexedDB/offline recording fallback 포팅
4. 원본 음성 비업로드 E2E 유지
5. meeting ID에 연결된 비음성 quality summary 저장 여부는 D3 결정 후 추가

이 묶음 이후 PostgreSQL schema/repository를 먼저 완성하고, speaker/dictionary/review 기능을 한 영역씩 올리는 것이 안전하다.

## 13. 통합 중 금지할 작업

- 로컬 `packages/db/src/index.ts`로 현재 파일 교체
- 로컬 placeholder migrator 사용
- 로컬 `compose.ec2.yml`로 현재 compose 교체
- 기존 migration 내용 수정 또는 로컬 `0002` 파일명 그대로 추가
- `getDemo*`/`saveDemo*`를 production route에서 임시 사용
- `ALLOW_RAW_AUDIO_SERVER_UPLOAD=true`를 배포 환경에 먼저 추가
- 현재 `/api/health/ready` 삭제
- EC2 port를 `3101:3000`으로 외부 전체 공개
- transcript revision/version conflict 처리를 제거
- deterministic provider 결과를 실제 AI 분석 완료로 표시
