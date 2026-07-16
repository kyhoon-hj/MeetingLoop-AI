# 단계 3 — Meeting-scoped API 통합 결과

작성일: 2026-07-16
대상 서버 프로젝트: `C:\Work\HJSolution\MeetingLoop-AI`
참조 로컬 프로젝트: `C:\Work\HJSolution\MeetingLoop-AI-source-20260715`

## 1. 결과 요약

단계 3에서는 기존 meeting-scoped transcript/minutes API를 유지하면서 단계 1·2 인계사항을 API 경계에 연결했다.

- 모든 보호 API가 `getSessionPayload()`를 통해 token을 검증한 뒤 DB membership과 현재 role을 다시 확인한다.
- route의 `meetingId`, session의 `organizationId`, body의 scope가 다르면 요청을 거부한다.
- transcript, minutes, AI generation body에 용도별 byte 제한을 적용한다.
- malformed JSON과 Zod validation 실패를 통제된 400 응답으로 변환한다.
- 확정 전사와 회의록 저장 시 `Idempotency-Key`를 단계 2 repository로 전달한다.
- viewer, cross-tenant, stale version, key reuse 충돌을 4xx 응답으로 처리한다.
- 예상하지 못한 오류는 상세 내용 없이 `INTERNAL_ERROR`를 반환하고 코드/이름만 구조화 로그에 남긴다.
- 단계 0 D5에 따라 실제 provider capability를 실행 직전에 검증하고, 상태 API에 demo/real 및 외부 전송 여부를 노출한다.

## 2. 공통 요청 경계

`apps/web/app/api-request.ts`에 공통 처리를 추가했다.

| 항목 | 적용값 |
|---|---|
| 확정 전사 body | 최대 1 MiB |
| 확정 회의록 body | 최대 512 KiB |
| AI 생성 설정 body | 최대 16 KiB |
| Idempotency key | 영문·숫자·점·밑줄·콜론·하이픈, 8~160자 |
| scope mismatch | `REQUEST_SCOPE_MISMATCH`, HTTP 400 |
| oversized | `REQUEST_TOO_LARGE` 또는 기존 transcript 전용 코드, HTTP 413 |
| malformed JSON | `INVALID_JSON`, HTTP 400 |

body에 `organizationId` 또는 `meetingId`가 포함된 경우 session/route 값과 같아야 한다. 일치하더라도 repository에는 인증 session과 route에서 결정한 값을 주입한다.

## 3. Idempotency 연결

다음 API가 `Idempotency-Key`를 `saveTranscript`/`saveMinutes`의 `ContentMutationOptions`로 전달한다.

- `PUT /api/meetings/[meetingId]/transcript`
- `PUT /api/meetings/[meetingId]/minutes`
- 호환용 `POST /api/minutes/finalize`

브라우저 `RecordingPanel`은 payload별 key를 보관한다.

- 같은 payload에서 네트워크 오류 또는 5xx가 발생하면 같은 key를 재사용한다.
- payload가 변경되면 새 key를 만든다.
- 성공하거나 통제된 4xx 응답을 받으면 보관 key를 비운다.

optimistic `version`도 계속 사용하므로 API는 동시 수정 충돌과 네트워크 중복 요청을 각각 방어한다.

## 4. 정책상 포팅하지 않은 API

로컬 버전의 다음 API는 `Demo` repository와 browser-only draft를 서버에 연결하므로 포팅하지 않았다.

- audio quality/normalize/VAD/overlap/diarize
- quick/precise transcription 및 source separation
- speaker assign/merge/split
- dictionary CRUD/import/apply
- transcript segment reprocess/edit history
- meeting analysis/review queue/item evidence/approve/reject

단계 0 D1~D3와 단계 1의 `BROWSER_ONLY` 계약에 따라 이 기능은 브라우저 처리 대상이다. data-policy test가 해당 서버 route의 부재를 검증한다.

## 5. 정책 게이트

- recording chunk upload route 없음
- playback signed URL route 없음
- server analyze-file route 없음
- raw audio upload 활성화 환경 변수 없음
- `/api/test/reset` route 없음
- production build route 목록에도 위 route가 없음

D1을 변경하기 전에는 upload threat model과 저장 구현을 시작하지 않는다.

## 6. 오류와 권한 검증

추가된 API contract test는 다음을 확인한다.

- unauthenticated 요청: 401
- viewer transcript mutation: 403
- route/body tenant 또는 meeting 불일치: 400
- malformed JSON: 400
- oversized transcript/minutes/generation body: 413
- 잘못된 idempotency key: 400
- stale transcript version: 409와 `currentVersion`
- repository idempotency 충돌: 409
- 유효한 key와 route scope가 repository에 전달됨

PostgreSQL integration test는 실제 membership/role, cross-tenant read, stale version, duplicate key, server persistence를 계속 검증한다.

## 7. 검증 결과

DB URL을 주입한 전체 CI 결과:

- lint: 통과
- TypeScript: 통과
- unit/API contract: 16 files, 52 tests 통과
- PostgreSQL integration/policy: 11 files, 55 tests 통과, skip 0
- 전체 workspace production build: 통과

production build를 포트 3127에서 두 번 기동하고 동일한 인증 cookie로 `GET /api/meetings/meeting-demo/transcript`를 호출했다.

- 두 요청 모두 HTTP 200
- 재시작 전후 response body 동일
- response SHA-256: `2375a2b8a57927d3ec78ef46211b6034ac92a99a1d74bce22bce5e62bd8be29b`

## 8. 이전 단계 인계사항 감사

단계 3 완료 후 단계 0~2 인계사항을 다시 대조했다.

- D1~D3: raw audio 및 browser-only 파생 데이터용 서버 route가 없고 policy integration test가 이를 고정한다.
- D4: 신규 API와 repository 입력은 확정 전사/회의록 텍스트만 사용하며 worker에 audio payload를 추가하지 않았다.
- D5: Ollama는 `real`/외부 전송 없음, Gemini는 `real`/확정 전사 외부 전송, mock은 `demo`로 상태 API와 화면에 표시한다. mock은 개발·CI에서만 실행 가능하다.
- 단계 2: mutation의 session/route scope와 `Idempotency-Key`가 repository까지 전달된다. body의 actor/organization 값은 권한 근거로 사용하지 않는다.
- mutation receipt 보존·정리 정책은 단계 2 인계대로 단계 7 운영 작업으로 유지한다.

## 9. 단계 4 인계 사항

브라우저 녹음·음질 UI는 audio frame/blob을 신규 서버 API로 보내지 않아야 한다. microphone preflight, normalization, VAD, overlap, diarization, draft reprocess 결과는 IndexedDB 또는 브라우저 메모리에 유지한다.

최종 사용자가 확정한 transcript/minutes 저장만 기존 meeting-scoped API를 사용한다. 신규 mutation을 추가할 경우 `api-request.ts`의 body/scope/idempotency 검증을 재사용하고 repository에서 membership/role/tenant를 다시 확인해야 한다.

단계 0에서 기록한 기존 E2E 기준선 결함은 단계 4 UI 작업에서 신규 회귀와 구분해 다룬다.
