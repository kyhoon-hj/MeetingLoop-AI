# 단계 2 — PostgreSQL schema 및 repository 통합 결과

작성일: 2026-07-16
대상 서버 프로젝트: `C:\Work\HJSolution\MeetingLoop-AI`
참조 로컬 프로젝트: `C:\Work\HJSolution\MeetingLoop-AI-source-20260715`

## 1. 결과 요약

단계 2의 migration, repository, integration test 작업을 완료했다. 로컬의 `0002_single_mic_audio_quality.sql`은 복사하지 않았으며, 단계 0 D1~D3에 맞춰 서버가 보유할 수 있는 확정 전사와 확정 회의록만 강화했다.

핵심 결과:

- `0006_single_mic_processing_schema.sql` append-only migration 추가
- 확정 transcript segment/revision에 `organization_id`, `meeting_id` 직접 소유권 추가
- minutes revision에 `organization_id`, `meeting_id` 직접 소유권 추가
- 복합 tenant FK와 명시적 cascade/restrict 정책 적용
- `content_mutation_receipts`를 이용한 전사/회의록 mutation idempotency 구현
- DB pool 재시작 후 persistence 및 조직 간 접근 차단 검증
- 빈 schema와 기존 `0001`~`0005` schema의 forward migration 검증
- migration checksum 변조와 partial failure rollback 검증

## 2. D3에 따른 범위 조정

기존 작업 목록의 `INT-0220`~`INT-0225`는 audio quality, VAD, overlap, speaker candidate, transcription candidate, dictionary, review draft를 PostgreSQL에 저장하도록 작성돼 있었다. 이는 단계 0 D3과 충돌한다.

따라서 다음 테이블과 repository는 만들지 않았다.

- `audio_quality_reports`, `audio_artifacts`, `audio_normalization_runs`
- `voice_regions`, `overlap_regions`
- `speaker_clusters`, `segment_speaker_assignments`, `speaker_assignment_events`
- `transcription_runs`, `precise_analysis_candidates`, `source_separation_results`, `transcript_words`, `transcription_selection_events`
- `project_dictionary_terms`, `dictionary_application_events`, `transcript_edit_events`
- `extracted_items`, `evidence_links`, `meeting_review_events`

통합 테스트에서 위 테이블이 public schema에 존재하지 않는 것을 확인한다. 이 항목들은 구현 누락이 아니라 정책에 따른 서버 영속 범위 제외다.

## 3. 0006 migration 구조

### 확정 전사

- `transcript_segments`에 `organization_id`, `meeting_id`를 backfill 후 `NOT NULL`로 추가했다.
- `(organization_id, meeting_id, transcript_id)`가 동일한 transcript를 가리키도록 복합 FK를 적용했다.
- 조직/회의/순서 조회 index를 추가했다.
- `raw_text`, `normalized_text`는 추가하지 않았다.

### revision

- `transcript_revisions`와 `meeting_minutes_revisions`에 조직/회의 소유권을 직접 추가했다.
- 부모 document와 organization/meeting이 일치하는 복합 FK를 적용했다.
- 부모 document 삭제 시 revision은 cascade 삭제된다.

### mutation receipt

`content_mutation_receipts`는 다음을 저장한다.

| 필드 | 용도 |
|---|---|
| `organization_id`, `meeting_id`, `actor_id` | tenant와 행위자 범위 |
| `operation` | `SAVE_TRANSCRIPT` 또는 `SAVE_MINUTES` |
| `idempotency_key` | 동일 mutation 재시도 식별 |
| `request_hash` | 같은 key를 다른 payload에 재사용하는 것 차단 |
| `status`, `response_json` | 완료 응답 재생과 중복 version 생성 방지 |

동일 조직·행위자·operation·key는 unique다. receipt는 meeting 삭제 시 cascade 삭제되고 actor 삭제는 restrict된다. `organization_id, created_at` retention index를 추가했다.

## 4. repository 동작

`saveTranscript`와 `saveMinutes`의 세 번째 인자로 선택적 `ContentMutationOptions`를 받는다.

```ts
await saveTranscript(userId, input, { idempotencyKey: "transcript-request-123" });
await saveMinutes(userId, input, { idempotencyKey: "minutes-request-123" });
```

처리 순서:

1. active membership과 actor role을 재검증한다.
2. meeting의 organization scope와 archived 상태를 검증한다.
3. idempotency receipt를 같은 transaction에서 선점하거나 완료 응답을 재생한다.
4. 신규 요청이면 기존 optimistic version을 검증하고 콘텐츠를 저장한다.
5. 성공 결과를 receipt에 기록하고 commit한다.

같은 key와 같은 payload의 재시도는 최초 응답을 반환한다. 같은 key에 다른 payload를 보내면 `MUTATION_IDEMPOTENCY_CONFLICT`가 발생한다. mutation 또는 receipt 갱신이 실패하면 전체 transaction이 rollback된다.

## 5. migration runner 검증

테스트용 임시 PostgreSQL schema와 `MIGRATIONS_DIRECTORY` override를 사용했다.

- 빈 schema에 `0001`~`0006` 일괄 적용
- `0001`~`0005` 적용 후 `0006` forward 적용
- 적용된 SQL을 변경했을 때 checksum 오류 확인
- 한 migration에서 DDL 실행 후 의도적으로 SQL 오류를 발생시켜 DDL과 `schema_migrations` 기록이 모두 rollback되는지 확인

검증 schema와 임시 migration 파일은 테스트 종료 시 제거된다.

## 6. 최종 검증 결과

DB URL을 명시적으로 주입한 `pnpm run ci` 결과:

- lint: 통과
- TypeScript project build: 통과
- unit: 12 files, 40 tests 통과
- PostgreSQL integration: 11 files, 51 tests 통과, skip 0
- 전체 workspace production build: 통과
- production 경로의 `saveDemo*`, `getDemo*`, `Demo*Repository` 참조: 0개
- `git diff --check`: 통과

## 7. 단계 3 인계 사항

Meeting-scoped API에서는 요청의 `Idempotency-Key`를 검증해 `saveTranscript`/`saveMinutes`의 세 번째 인자로 전달해야 한다. API에서 사용자나 조직 정보를 body 값만 신뢰하지 말고 현재 DB session membership과 route의 `meetingId`를 repository 입력과 다시 대조해야 한다.

mutation receipt 정리 주기와 실제 보존 기간은 단계 7 retention 작업에서 확정한다. D3 대상 데이터를 서버에 추가하려면 구현보다 먼저 데이터 정책을 개정해야 한다.
