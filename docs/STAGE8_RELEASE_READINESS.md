# 단계 8 회귀 및 릴리스 준비

작성일: 2026-07-16
상태: 로컬 release candidate 준비 완료, 실제 서버 배포 전 외부 게이트 대기

## 1. 소스 기준선

- branch: `codex/stage2-persistence-schema`
- base commit: `9d3453309780b156735d1a57e1a25afd63b95f67`
- Node.js: `v24.15.0`
- pnpm: `11.7.0`
- Docker: `29.5.3`
- Docker Compose: `5.1.4`
- 단계 0~8 변경은 아직 commit/tag되지 않은 working tree에 있다. 실제 배포 전 변경 검토, commit, immutable tag가 필요하다.

## 2. 자동 검증 결과

| 검증 | 결과 |
|---|---|
| lint | 통과 |
| TypeScript typecheck | 통과 |
| unit | 20 files, 70 tests 통과 |
| PostgreSQL integration | 12 files, 64 tests 통과, skip 0 |
| Redis Queue | 중복 제출 및 worker 재시작 1 test 통과 |
| Playwright E2E | mobile/tablet/desktop 39 tests 통과 |
| production build | web/worker 포함 통과 |
| Docker build | web/worker/migrator/db-ops 통과 |
| Compose config/smoke | PostgreSQL 16, Redis, migrate, web, worker 통과 |
| backup/restore | custom dump, SHA-256, 격리 restore, orphan 검증 통과 |

로컬 RC tag는 `stage8-rc-local-20260716`으로 web, worker, migrator, db-ops 이미지에 적용했다. registry push용 최종 tag는 commit SHA가 확정된 뒤 다시 지정한다.

| image | local image ID |
|---|---|
| web | `sha256:727fa27b30110833d25fd43828e5dc7ec3237024d7d52c959fea46d4d9f4cabf` |
| worker | `sha256:9382d808441ca55a19fc08524e0bc1334ee8c1af90972ca5e3d6b64b5d7dbceb` |
| migrator | `sha256:299e5a04614047e25e806ef2d34d3299681d6ff1ae5d91b24a78fbb5009d5c93` |
| db-ops | `sha256:65c8e494ee40aaee04cd8238766b031c710d10daa2fb81ae06faea5f34119dd5` |

## 3. 단계 8에서 발견하고 수정한 배포 차단 문제

- 브라우저 검토 상태를 비동기로 복원하는 동안 사용자가 수정한 전사가 늦게 도착한 저장 초안으로 덮일 수 있는 경쟁 조건을 차단했다.
- 로그인 navigation이 끝나기 전에 녹음 테스트가 클릭되는 E2E 동기화를 안정화했다.
- Dockerfile의 마지막 stage가 worker이므로 web 서비스가 worker image로 빌드되던 문제를 발견해 `web.build.target: runner`를 고정했다.
- PostgreSQL 18 client dump를 PostgreSQL 16에 복원할 때 발생하는 `transaction_timeout` 호환 오류를 확인했다. `POSTGRES_OPS_VERSION` 기본값을 운영 major인 16으로 고정하고, 다른 major는 명시적으로 같은 버전 client를 빌드하도록 변경했다.

## 4. production-like Compose 리허설

`compose.stage8-smoke.yml`로 외부와 분리된 PostgreSQL 16과 Redis를 기동했다.

- 빈 DB에 migration `0001`~`0007` 순차 적용
- web readiness: `ok`, database/schema: `ok`
- worker readiness: `ok`, schema: `0007_privacy_retention_operations.sql`
- Redis Queue reachable: `true`
- retention sweep: `false`
- web port: `127.0.0.1:3101`에만 바인딩
- web/worker 재시작 후 테스트 조직과 migration 7개 유지
- backup checksum과 격리 DB restore 후 테스트 조직 및 migration 7개 복원 확인

로컬 smoke 재현 명령:

```powershell
$env:ENV_FILE='.env.docker.example'
docker compose -p meetingloop-stage8 -f compose.ec2.yml -f compose.stage8-smoke.yml --env-file .env.docker.example up -d postgres redis
docker compose -p meetingloop-stage8 -f compose.ec2.yml -f compose.stage8-smoke.yml --env-file .env.docker.example run --rm migrate
docker compose -p meetingloop-stage8 -f compose.ec2.yml -f compose.stage8-smoke.yml --env-file .env.docker.example up -d --no-build --no-deps web worker
```

## 5. migration SHA-256

| migration | SHA-256 |
|---|---|
| `0001_phase1_auth_project.sql` | `3b36597ee97a490effbf39d4d2ccbd11609244cfd85f16bde730f1170fde7b4c` |
| `0002_stage0_data_policy.sql` | `8ba551e2660727e1fbf2732ac853894151119ad09f26ba5322a723a1cb2f3bad` |
| `0003_confirmed_content_only.sql` | `ae652e9c56fadee26cb66f4c1435bc70ab754b7f0abbd37931bf845066d2f7a3` |
| `0004_stage2_persistence_schema.sql` | `f7b647a52819d0e19d316b02dbfcf29792ed60475d759de512fdeeef5ef7a2af` |
| `0005_tenant_scope_constraints.sql` | `9abfd03212f71b7e7768d8045c832e194eb580987acac9301393e67cb56f0121` |
| `0006_single_mic_processing_schema.sql` | `9b8b93364d99add6aaae8058726352ababfdf8a9104e3ce2aca627696eceb758` |
| `0007_privacy_retention_operations.sql` | `57b8e095d21aac5bf786a262c435a28ae1777feac7840f1f764bd51b74a5a37e` |

## 6. 실제 서버 배포 전 남은 게이트

1. working tree를 검토하고 commit/tag해 배포 소스를 불변으로 만든다.
2. 운영 PostgreSQL major를 확인하고 `POSTGRES_OPS_VERSION`을 동일하게 설정한다.
3. 운영 DB 복제본에서 backup→restore→`0007` migration dry-run을 수행해 `INT-0809`를 완료한다.
4. `.env.docker`의 `SESSION_SECRET`, `APP_URL`, DB SSL, Gemini/Ollama 설정을 운영 값으로 채우고 예시 값이 남지 않았는지 검사한다.
5. Nginx HTTPS에서 로그인, 권한 변경/비활성화, 실제 마이크, AI provider, 재시작 시나리오를 수동 인수한다.
6. 배포 직전 운영 backup과 checksum을 별도 보관한다.
7. 첫 배포에서는 `RETENTION_SWEEP_ENABLED=false`를 유지한다.

## 7. 배포 및 중단 기준

배포 순서는 backup → migrator → Redis → web/worker → readiness → 핵심 시나리오다. migrator, web readiness, worker readiness 중 하나라도 실패하면 새 web/worker 교체를 중단한다. rollback을 위해 직전 web/worker image tag와 DB backup을 유지하며, migration은 기존 파일을 수정하지 않고 후속 append-only migration으로 복구한다.
