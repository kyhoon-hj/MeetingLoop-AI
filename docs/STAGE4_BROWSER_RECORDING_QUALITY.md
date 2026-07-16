# 단계 4 — 브라우저 녹음 및 음질 UI 통합 결과

작성일: 2026-07-16
대상 서버 프로젝트: `C:\Work\HJSolution\MeetingLoop-AI`
참조 로컬 프로젝트: `C:\Work\HJSolution\MeetingLoop-AI-source-20260715`

## 1. 결과 요약

로컬 버전의 microphone preflight, 입력 레벨, 브라우저 녹음, IndexedDB, 모바일 AAC fallback, 음질 리포트를 현재 서버 버전의 meeting/version/persistence 흐름에 통합했다.

로컬 버전의 `/api/audio/quality`, recording upload, playback, analyze-file 경로는 가져오지 않았다. audio frame, Blob, 음질 report는 모두 브라우저에서 생성·보관하며 서버에는 기존 정책대로 사용자가 확정한 전사와 회의록만 저장한다.

## 2. 모듈 경계

| 모듈 | 역할 |
|---|---|
| `browser-recording.ts` | MIME 선택, 품질 분석, meeting/session scoped IndexedDB 저장 |
| `useBrowserRecording.ts` | 권한, 5초 점검, recorder, level meter, offline, fallback controller |
| `AudioQualityPanel.tsx` | 입력 상태와 녹음 종료 품질 리포트, 접근성 live text |
| `TranscriptEditor.tsx` | 기존 최종 전사 version/persistence UI |
| `meeting-api-client.ts` | offline, abort, version conflict, idempotent retry 공통 처리 |
| `RecordingPanel.tsx` | meeting-scoped transcript/minutes orchestration과 위 모듈 조합 |

`RecordingPanel.tsx`는 1,022줄, recording hook은 530줄로 유지해 로컬 버전의 3,000줄 이상 단일 component 구조를 재도입하지 않았다.

## 3. 녹음과 저장

- 마이크 권한은 30초 timeout과 장치별 오류 문구를 사용한다.
- 5초 preflight는 250ms frame의 RMS, peak, zero-crossing rate를 브라우저에서 계산한다.
- 녹음 MIME은 WebM/Opus를 우선하고 지원하지 않는 모바일 브라우저에서는 MP4/AAC 또는 M4A를 선택한다.
- 원본 chunk는 meeting ID, recording ID, session ID, part number와 함께 IndexedDB에 저장한다.
- 네트워크가 끊겨도 MediaRecorder와 IndexedDB 저장은 계속된다.
- IndexedDB/localStorage를 사용할 수 없으면 녹음을 중단하지 않고 Blob을 메모리에 유지하며 즉시 다운로드하도록 안내한다.
- 녹음 종료 후 audio element와 원래 MIME에 맞는 파일 확장자를 제공한다.

## 4. 음질 UI

입력 점검과 녹음 종료 리포트에서 다음 항목을 표시한다.

- 실시간 입력 level
- 전체 품질 점수
- 음성, 무음, 저음량, clipping/왜곡, 소음 후보 비율
- sample rate와 channel 수
- 마이크 거리, 입력 음량, 주변 소음에 대한 조정 권고

리포트에는 `persistence: BROWSER_ONLY`가 적용된다. 현재 meeting ID에 연결되지만 API, PostgreSQL, worker로 전송되지 않는다.

## 5. API client와 기존 흐름 보존

전사/회의록 mutation은 기존 optimistic version과 payload-stable idempotency key를 유지한다. 공통 client가 다음을 처리한다.

- offline 상태에서 서버 mutation 사전 차단
- `AbortSignal` 전달
- 409 version conflict를 retry하지 않고 로컬 편집 유지
- network/5xx에서 같은 idempotency key로 1회 retry
- 통제된 API error payload 유지

## 6. 검증 결과

- lint: 통과
- TypeScript: 통과
- unit/API contract: 18 files, 57 tests 통과
- Playwright E2E: mobile/tablet/desktop 36 tests 통과
- PostgreSQL integration/policy: 최종 CI에서 skip 없이 재검증
- production build: 최종 CI에서 재검증

E2E는 다음 단계 4 경계를 직접 확인한다.

- 5초 preflight와 음질 점수
- preflight 중 raw audio/API request 0건
- 모바일 MP4/AAC 선택 및 `.m4a` 다운로드
- IndexedDB 실패 후 메모리 fallback과 녹음 완료
- offline 표시와 녹음 제어 유지
- 기존 전사 확정, 회의록 생성/확정, 회의 목록·상세·검색 흐름

## 7. 단계 5 인계 사항

화자, dictionary, raw/normalized/edited draft, overlap, evidence review UI는 `TranscriptEditor`와 별도 browser-only module로 확장한다. 단계 0 D2~D3를 변경하지 않는 한 이 초안 데이터용 서버 route나 PostgreSQL table을 추가하지 않는다.

서버 저장이 필요한 최종 변경은 현재 `meeting-api-client.ts`와 meeting-scoped transcript/minutes API를 사용하고 version conflict 시 브라우저 초안을 덮어쓰지 않아야 한다.
