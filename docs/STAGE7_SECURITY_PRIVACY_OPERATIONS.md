# 단계 7 보안, 개인정보, 보존 및 운영

작성일: 2026-07-16
상태: 구현 완료, 운영 retention 활성화 전 dry-run 필요

## 1. 구현 결과

- append-only `0007_privacy_retention_operations.sql`로 녹음 동의 actor/version, 개인정보 감사 이벤트, Gemini 동의, 회의 삭제 요청을 추가했다.
- 빠른 녹음 회의는 더 이상 묵시적으로 동의 처리하지 않는다. 녹음 시작 직전 UI와 API가 동의를 확인하며 오프라인 동의는 idempotent payload로 보류 후 재연결 시 동기화한다.
- Gemini는 확정 전사 TXT의 외부 전송 범위를 실행 전에 표시하고 별도 동의를 요구한다. meeting-scoped/legacy API와 worker가 모두 DB 동의를 재검증한다.
- ORG_ADMIN/PROJECT_ADMIN은 회의 ID를 다시 입력해 전체 회의 삭제를 요청할 수 있다. 요청 즉시 조회에서 숨기고 30일 후 worker가 meeting, transcript, minutes, revision, receipt를 cascade 삭제한다.
- 조직 보존기간이 만료된 회의는 복구기간보다 우선해 purge 대상으로 등록된다.
- retention sweep은 안전한 최초 배포를 위해 기본 비활성화다. backup/restore 확인 후 `RETENTION_SWEEP_ENABLED=true`로 활성화한다.
- 운영 DB major와 일치하는 PostgreSQL client 기반 custom-format backup, SHA-256 검증, 35일 정리, 격리 DB restore 검증 스크립트와 `db-ops` image를 추가했다. 기본값은 운영 기준 PostgreSQL 16이며, PostgreSQL 18 개발 DB 검증 시 `POSTGRES_OPS_VERSION=18`로 별도 빌드한다.

## 2. 저장 경계

서버에는 확정 전사·확정 회의록과 revision, consent/deletion audit만 저장한다. 원본 음성, object storage key, signed URL, raw/normalized draft, 음질/VAD/overlap/화자/review 초안은 저장하지 않는다. 감사 metadata에는 event reason, 정책 버전, data scope만 허용하며 회의 제목·전사·회의록 본문은 넣지 않는다.

## 3. 배포 및 retention 활성화

1. DB backup을 생성하고 SHA-256을 확인한다.
2. 격리된 검증 DB에 restore하고 `0007` 및 tenant orphan query를 확인한다.
3. migrator로 `0007`을 적용한다.
4. web/worker를 `RETENTION_SWEEP_ENABLED=false`로 먼저 교체한다.
5. 삭제 후보를 운영자가 SQL로 검토한다.
6. `RETENTION_SWEEP_ENABLED=true`로 worker를 재기동한다.
7. worker log의 scheduled/purged count와 `privacy_audit_events`를 확인한다. 로그에는 meeting ID 목록이나 콘텐츠가 출력되지 않는다.

```powershell
$env:ENV_FILE='.env.docker'
docker compose -f compose.ec2.yml --profile ops build db-backup
docker compose -f compose.ec2.yml --profile ops run --rm db-backup
```

복원 검증은 운영 DB와 다른 빈 데이터베이스만 사용한다.

```powershell
docker compose -f compose.ec2.yml --profile ops run --rm `
  -e RESTORE_DATABASE_URL='postgresql://.../meeting_restore_verify' `
  -e BACKUP_FILE='/backups/meetingloop-YYYYMMDDTHHMMSSZ.dump' `
  db-backup /usr/local/bin/db-restore-verify.sh
```

## 4. 실패 및 복구 의미

- consent API replay는 actor/event/idempotency key unique index로 감사 이벤트를 중복 생성하지 않는다.
- 삭제 요청 replay는 meeting별 unique request를 반환하며 purge 시각을 연장하지 않는다.
- 삭제 요청 후 30일 동안 DB에는 콘텐츠가 남지만 모든 일반 repository 조회는 차단된다.
- purge transaction이 실패하면 meeting 삭제와 audit insert가 함께 rollback된다.
- provider 실패는 confirmed transcript/minutes를 변경하지 않는다.
- worker 장애는 web readiness를 내리지 않으며 retention과 AI 상태는 worker health/AI status로 별도 확인한다.

## 5. 2026-07-16 로컬 검증 결과

- lint, TypeScript typecheck, 단위 테스트 70건을 통과했다.
- PostgreSQL 통합 테스트 63건과 Redis Queue 중복 제출/worker 재시작 테스트 1건을 통과했다.
- mobile/tablet/desktop E2E 39건을 통과했다.
- production web/worker build와 Compose config 검증을 통과했다.
- 최종 worker image의 readiness에서 `schema=0007_privacy_retention_operations.sql`, Queue reachable, retention disabled를 확인했다.
- custom-format backup, SHA-256, 임시 격리 DB 전체 restore, migration/orphan 검증, 임시 DB 정리를 실제 수행했다.

## 6. 다음 단계 인계

- 실제 운영 DB 복제본에서 backup/restore와 migration dry-run을 다시 수행한다.
- PROJECT_ADMIN별 project assignment와 EXTERNAL meeting ACL은 현재 schema에 없으므로 공유 기능 확장 전에 구현한다.
- 30일 복구기간의 self-service 복원 UI는 아직 없다. 필요 시 deletion request 취소 API와 별도 감사 이벤트를 추가한다.
- production alert에 retention 실패, Queue failed/lag, backup age와 restore 검증 시각을 연결한다.
