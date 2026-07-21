# MeetingLoop AI 통합 및 운영 배포 완료 보고서

작성일: 2026-07-16
대상 시스템: MeetingLoop AI
운영 주소: `https://meet.hjshub.com`
최종 배포 버전: `v0.1.1`
보고 상태: 운영 배포 및 기본 검증 완료, 보안·운영 후속 항목 일부 대기

## 1. 작업 목적

서버 실행이 가능한 현재 프로젝트를 기준선으로 유지하면서 로컬 기능 버전의 개선 사항을 단계적으로 통합하고, 기존 서버 기능·데이터·배포 구조와의 충돌을 해소한 뒤 실제 운영 EC2 환경에 배포하는 것을 목표로 했다.

통합 시 다음 원칙을 적용했다.

- 로컬 프로젝트 전체를 덮어쓰지 않고 검증 가능한 기능 단위로 통합한다.
- 기존 PostgreSQL migration은 수정하지 않고 append-only migration만 추가한다.
- 모든 서버 데이터 접근에 organization/meeting 범위와 사용자 권한을 적용한다.
- 원본 음성은 서버로 전송하지 않고 브라우저에만 보관한다.
- 서버에는 사용자가 확정한 전사와 회의록만 저장한다.
- 운영 환경은 기존 AWS RDS를 사용하며 별도 Docker PostgreSQL을 실행하지 않는다.
- 실제 분석은 Redis Queue와 worker를 통해 Gemini provider로 처리한다.

## 2. 최종 소스 및 릴리스 기준선

| 구분 | 결과 |
|---|---|
| 통합 PR | GitHub PR `#1` |
| 통합 merge commit | `5d29fac` |
| 최초 운영 release | `v0.1.0` |
| 운영 자격 증명 노출 방지 hotfix PR | GitHub PR `#2` |
| hotfix commit | `dd8ce7f` |
| 최종 main merge commit | `b9723036b64efc508342dec2ce3bbc86ffbaf743` |
| 최종 운영 release | `v0.1.1` |
| 운영 소스 경로 | `/home/ubuntu/MeetingLoop-AI` |

운영 서버의 소스는 `origin/main`의 `b972303`과 `v0.1.1` 기준으로 배포했다. 비밀 값, 운영 DB 자격 증명, Gemini API key와 세션 비밀 값은 소스 및 본 보고서에 기록하지 않았다.

## 3. 단계별 통합 완료 결과

| 단계 | 주요 결과 | 상태 |
|---|---|---|
| 단계 0 정책과 기준선 | 원본 음성, 전사, 파생정보, Queue, demo/real provider 정책 D1~D5 확정 | 완료 |
| 단계 1 도메인/provider 계약 | 음질·전사·화자·사전·검토 계약 통합, 위험 항목 자동확정 방지 | 완료 |
| 단계 2 PostgreSQL/repository | `0006_single_mic_processing_schema.sql`, tenant scope, version/idempotency 및 영속성 검증 | 완료 |
| 단계 3 Meeting-scoped API | 인증·membership 재검증, meeting/organization 범위, body/version/idempotency 보호 | 완료 |
| 단계 4 브라우저 녹음/음질 UI | 5초 마이크 점검, IndexedDB 녹음, 오프라인·모바일 codec fallback, 원본 음성 비업로드 | 완료 |
| 단계 5 화자/사전/전사/검토 UI | 화자 검토, 사전 적용, 전사 수정, evidence 검토, 브라우저 초안 복원 | 완료 |
| 단계 6 Queue/worker/provider/배포 | Redis/BullMQ, text-only worker, Gemini/Ollama adapter, Docker 배포 구조 | 완료 |
| 단계 7 보안/개인정보/운영 | 녹음·Gemini 동의, 삭제 요청, 감사 이벤트, backup/restore, retention 구조 | 완료 |
| 단계 8 회귀/릴리스 | 자동 회귀, production build, Docker smoke, RDS 복구 dry-run, 운영 배포 | 완료 |

## 4. 확정된 데이터 처리 구조

### 4.1 브라우저 보관 데이터

- 원본 녹음 파일과 녹음 chunk
- 음질 분석 frame 및 보고서
- raw/normalized 전사 초안
- 화자 후보, 사전 적용 초안, overlap/evidence/review 초안

이 데이터는 IndexedDB와 브라우저 상태를 사용하며 서버 업로드 API를 만들지 않았다.

### 4.2 PostgreSQL 저장 데이터

- 사용자와 조직 membership
- 프로젝트와 회의
- 사용자가 확정한 전사 및 revision
- 사용자가 확정한 회의록 및 revision
- 녹음 동의와 Gemini 외부 전송 동의 감사 이벤트
- 삭제 요청, 보존 및 mutation receipt

### 4.3 분석 처리 경로

1. 사용자가 확정한 전사와 Gemini 외부 전송 동의를 서버가 재검증한다.
2. web이 `minutes.generate` 작업을 Redis Queue에 등록한다.
3. worker가 membership, meeting 범위 및 전사 version을 다시 검증한다.
4. 확정된 전사 텍스트만 Gemini로 전송한다.
5. 생성 결과는 초안으로 반환하며, 사용자가 검토·저장해야 확정 회의록 revision이 생성된다.

## 5. 자동 검증 결과

운영 배포 전 release candidate에서 다음 검증을 완료했다.

| 검증 항목 | 결과 |
|---|---|
| ESLint | 통과 |
| TypeScript typecheck | 통과 |
| 단위 테스트 | 20 files, 70 tests 통과 |
| PostgreSQL 통합 테스트 | 12 files, 64 tests 통과, skip 0 |
| Redis Queue 통합 테스트 | 중복 제출 및 worker 재시작 시나리오 통과 |
| Playwright E2E | mobile/tablet/desktop 39 tests 통과 |
| production build | web/worker 모두 통과 |
| Docker image build | web/worker/migrator/db-ops 통과 |
| Compose smoke | PostgreSQL/Redis/migrate/web/worker 통과 |
| backup/restore | custom dump, SHA-256, 격리 restore 및 orphan 검사 통과 |

주요 negative test에는 미인증 요청, VIEWER mutation, cross-tenant 접근, stale version, 중복 idempotency key, oversized/malformed body, 비활성 membership 및 production mock provider 거부가 포함된다.

## 6. 운영 RDS 검증 및 migration

운영 환경에서는 설정된 AWS RDS PostgreSQL만 사용했다. Compose 운영 서비스 목록은 `migrate`, `redis`, `web`, `worker`이며 PostgreSQL 컨테이너는 포함하지 않았다.

| 항목 | 결과 |
|---|---|
| 운영 PostgreSQL | AWS RDS PostgreSQL 18.3 |
| PostgreSQL 운영 도구 버전 | `POSTGRES_OPS_VERSION=18` |
| DB SSL | 사용, RDS 인증서 환경에 맞춘 연결 설정 적용 |
| 배포 전 migration 수 | 5 |
| 배포 후 migration 수 | 7 |
| 최종 migration | `0007_privacy_retention_operations.sql` |
| transcript/minutes orphan | 0 |
| 격리 복구 검증용 임시 DB | 검증 후 삭제, 잔존 0 |
| Docker PostgreSQL | 실행 0 |

### 6.1 운영 배포 전 백업

- 파일: `backups/meetingloop-pre-v0.1.0-20260716T055828Z.dump`
- SHA-256: `05f0fb5f72f4f0fa20f30a92f21619580ef71cff671abd7155edec8dabe9c948`

### 6.2 db-ops 최종 백업

- 파일: `backups/meetingloop-20260716T060801Z.dump`
- SHA-256: `d36ae8256da4ce64ae99fd7849b6546c69c8658d6b8783ffc3877259c7871559`
- PostgreSQL custom format 및 `pg_restore --list` 검증 완료

운영 DB를 직접 변경하기 전에 별도 임시 RDS 데이터베이스에 백업을 복원하고 `0006`, `0007` migration과 tenant orphan 검사를 먼저 실행했다. 첫 시도에서 Node PostgreSQL client의 인증서 검증 설정 차이를 발견했으며, 운영 RDS SSL 정책에 맞는 애플리케이션 연결 설정과 `psql` 검증 설정을 분리한 뒤 재실행해 통과했다. 실패한 임시 DB도 삭제하고 운영 DB에는 영향을 주지 않았다.

## 7. 운영 배포 결과

### 7.1 실행 구성

| 서비스 | 이미지/버전 | 외부 공개 | 최종 상태 |
|---|---|---|---|
| web | `meetingloop-ai:latest`, release `v0.1.1` | Nginx를 통한 HTTPS, 내부 `127.0.0.1:3101` | healthy |
| worker | `meetingloop-ai-worker:latest`, release `v0.1.0` 소스 기능 | 비공개 health port | healthy |
| Redis | `redis:7.4-alpine`, AOF volume | 비공개 | healthy |
| PostgreSQL | AWS RDS | Docker로 실행하지 않음 | healthy |

web hotfix 최종 image ID는 `sha256:c4b5efdcacdad67853c911aa4845d9b2d99248a9078a2f7ee400382c43205495`이다.

### 7.2 운영 환경 확인값

- `APP_URL=https://meet.hjshub.com`
- `ANALYSIS_QUEUE_MODE=redis`
- `ANALYSIS_PROVIDER=gemini`
- `GEMINI_MODEL=gemini-3.1-flash-lite`
- `RETENTION_SWEEP_ENABLED=false`
- `ALLOW_DEMO_ACCOUNT_HINTS=false`
- `SESSION_SECRET` 및 `GEMINI_API_KEY` 설정 여부 확인
- Redis `PING=PONG`, Queue 접근 가능
- Queue waiting/active/delayed/failed/completed 모두 0인 초기 정상 상태 확인
- web과 worker 재시작 후 다시 healthy가 되는 것을 확인

## 8. 운영 HTTPS 및 화면 검증

`https://meet.hjshub.com`을 통해 다음 항목을 확인했다.

| 검증 | 결과 |
|---|---|
| `/api/health` | HTTP 200, DB 정상 |
| `/api/health/ready` | HTTP 200, schema `0007` 정상 |
| 로그인 | 운영 관리자 계정으로 성공 |
| 인증 후 조직/사용자 | 조직과 관리자 membership 정상 조회 |
| 프로젝트/회의 화면 | 생성·검색·상세 및 녹음 작업 화면 렌더링 확인 |
| Gemini 상태 | `gemini-3.1-flash-lite` 사용 가능 상태 확인 |
| Queue/worker 상태 | Redis Queue 및 worker 정상, failed 0 |
| 녹음/전사/검토 UI | 화면 구성 및 브라우저 저장 흐름 확인 |
| JavaScript console | 점검 시 오류 및 경고 없음 |
| 로그아웃 후 로그인 화면 | email/password 공란, 데모 계정 안내 미노출 |

`/api/health`의 `aiMode=mock`은 실제 운영 분석 provider를 뜻하지 않는다. 이 값은 health route 내부의 고정 mock 전사 자체검사 표시이며, 실제 분석 경로는 `ANALYSIS_PROVIDER=gemini`, `/api/ai/status` 및 worker 상태로 별도 확인했다.

## 9. 배포 과정에서 발견하고 조치한 문제

| 문제 | 영향 | 조치 |
|---|---|---|
| Dockerfile 마지막 stage 때문에 web이 worker image로 빌드될 가능성 | web 기동 실패 위험 | Compose web build target을 `runner`로 고정 |
| PostgreSQL client/server major 불일치 | dump/restore 호환 오류 | 운영 RDS major와 같은 PostgreSQL 18 db-ops 사용 |
| RDS SSL 인증서 검증 방식 차이 | 격리 migration dry-run 첫 시도 실패 | 앱과 psql 연결 정책을 분리해 재검증 |
| 운영 도메인과 기존 `APP_URL` 불일치 | callback/cookie 경로 오류 위험 | `https://meet.hjshub.com`으로 수정 |
| 운영 로그인 화면에 실제 유효한 데모 자격 증명 표시 | 계정 노출 위험 | PR `#2`, `v0.1.1` hotfix로 production prefill/안내 제거 |
| Compose 자동 컨테이너 이름 사용 | 이름 직접 조회 시 상태 확인 누락 | 서비스 이름 기반 `docker compose ps`로 최종 확인 |
| 실시간 전사 오류가 모두 같은 팝업으로 표시 | 원인 판별 불가 및 불필요한 경고 가능 | 원인 분석 완료, 후속 개선 항목으로 등록 |

## 10. 실시간 전사 팝업 분석 결과

`실시간 전사를 계속할 수 없습니다` 팝업은 서버·Gemini·RDS 장애가 아니라 브라우저 Web Speech API의 `SpeechRecognition.onerror`가 발생할 때 표시된다. 원본 녹음은 별도 `MediaRecorder`와 IndexedDB 경로로 계속 저장된다.

현재 구현은 실제 오류 코드를 받지 않고 모든 오류를 동일 문구로 처리한다. 따라서 `no-speech`, `network`, `not-allowed`, `audio-capture`, `aborted`를 구분할 수 없다. 녹음이 정상 진행 중이라면 `no-speech` 또는 브라우저 음성인식 서비스의 일시적인 `network` 오류 가능성이 높다.

후속 개선 시 오류 코드를 기록하고 다음 정책을 적용해야 한다.

- `no-speech`, `aborted`: 팝업 없이 제한적으로 자동 재시도
- `network`: backoff를 적용한 재시도와 상태 안내
- `not-allowed`: 브라우저 음성인식/마이크 권한 안내
- `audio-capture`: 입력 장치 충돌 안내
- 반복 오류: 실시간 전사만 중단하고 녹음은 유지

## 11. 롤백 및 복구 준비

- 직전 web image를 `meetingloop-ai:rollback-9d34533`으로 보존했다.
- 운영 migration 직전 custom-format RDS backup과 SHA-256을 보존했다.
- migration 파일은 기존 파일을 수정하지 않는 append-only 방식이다.
- web/worker readiness 실패 시 새 컨테이너 교체를 중단할 수 있다.
- DB 복구가 필요한 경우 운영 DB가 아닌 격리 DB에서 먼저 restore 검증하도록 스크립트를 구성했다.

## 12. 남은 운영 및 보안 항목

다음 항목은 배포 실패가 아니라 별도 승인 또는 실제 운영 정책이 필요한 후속 작업이다.

### P0 — 즉시 권장

1. **초기 관리자 비밀번호 회전**
   로그인 화면 노출은 제거했지만 기존 초기 비밀번호 자체는 아직 유효하다. 관리자 접근을 보존하는 방식으로 강한 무작위 비밀번호 회전이 필요하다.

### P1 — 운영 안정화

1. **Retention sweep 활성화 결정**
   첫 배포 안전 원칙에 따라 `RETENTION_SWEEP_ENABLED=false`이다. 삭제 후보 dry-run과 보존기간 정책을 승인한 후 활성화한다.
2. **실제 Gemini 분석 인수**
   provider 연결 가능 상태까지 확인했다. 실제 운영 전사로 분석 결과의 품질·비용·지연을 평가하는 live job은 개인정보 외부 전송과 비용이 발생하므로 별도 승인 후 수행한다.
3. **실시간 전사 오류 세분화**
   Web Speech API 오류 코드를 UI와 안전 로그에서 구분하고 무음·중단 오류의 반복 팝업을 억제한다.
4. **운영 모니터링 연결**
   Queue lag/failed, worker readiness, RDS backup age, restore 검증 시각, retention 실패에 대한 경보 임계값을 연결한다.
5. **백업 파일 운영 권한 정리**
   db-ops가 생성한 파일을 운영 사용자가 직접 관리할 수 있도록 소유권/권한 표준화 절차를 자동화한다.

## 13. 최종 판정

로컬 기능 버전의 단계 0~8 통합, 자동 회귀검증, 운영 RDS 백업·격리복구·migration, EC2 web/worker/Redis 배포 및 공개 HTTPS 기본 인수를 완료했다. 운영 환경은 요구사항대로 별도 Docker PostgreSQL 없이 기존 RDS만 사용한다.

현재 릴리스 `v0.1.1`은 로그인, DB readiness, Queue/worker, Gemini provider 상태, 주요 회의 UI를 사용할 수 있는 운영 배포 상태다. 다만 초기 관리자 비밀번호 회전은 보안상 배포 직후 수행해야 하며, retention 자동삭제와 실제 Gemini live 분석은 각각 운영 정책 및 개인정보·비용 승인을 받은 뒤 활성화한다.

## 14. 관련 문서 및 변경 이력

- `docs/LOCAL_VERSION_INTEGRATION_ANALYSIS.md`
- `docs/LOCAL_VERSION_INTEGRATION_WORKLIST.md`
- `docs/STAGE0_POLICY_AND_BASELINE.md`
- `docs/STAGE1_DOMAIN_PROVIDER_CONTRACTS.md`
- `docs/STAGE2_POSTGRESQL_REPOSITORY.md`
- `docs/STAGE3_MEETING_SCOPED_API.md`
- `docs/STAGE4_BROWSER_RECORDING_QUALITY.md`
- `docs/STAGE5_SPEAKER_DICTIONARY_REVIEW_UI.md`
- `docs/STAGE6_QUEUE_WORKER_PROVIDER_DEPLOYMENT.md`
- `docs/STAGE7_SECURITY_PRIVACY_OPERATIONS.md`
- `docs/STAGE8_RELEASE_READINESS.md`
- 통합 PR: `https://github.com/kyhoon-hj/MeetingLoop-AI/pull/1`
- 운영 로그인 보안 hotfix PR: `https://github.com/kyhoon-hj/MeetingLoop-AI/pull/2`
