# 단계 1 — 도메인 및 provider 계약 통합 결과

작성일: 2026-07-16
대상 서버 프로젝트: `C:\Work\HJSolution\MeetingLoop-AI`
참조 로컬 프로젝트: `C:\Work\HJSolution\MeetingLoop-AI-source-20260715`

## 1. 결과 요약

단계 1 작업 항목 `INT-0101`~`INT-0112`를 완료했다. 로컬 버전의 음질 분석, 정규화, VAD, 겹침, 화자 분리, 전사 후보, 사전, 검토 루프 계약과 결정론적 provider를 서버 프로젝트에 통합했다.

통합 시 단계 0 정책을 코드 경계로 반영했다.

- 원본/파생 오디오 artifact는 서버 storage key가 아니라 브라우저 `browserKey`만 가진다.
- raw/normalized/edited 전사 3계층은 `LOCAL_DRAFT` + `BROWSER_ONLY` 계약에만 존재한다.
- 서버 confirmed transcript 계약은 기존 `editedText`, `CONFIRMED`, optimistic version 구조를 유지한다.
- HIGH overlap 또는 화자 미확정 evidence는 자동 확정할 수 없다.
- deterministic provider는 `demo` capability이며 production 서버 정책에서 거부된다.
- Ollama/Gemini 회의록 provider는 confirmed text만 받는 `real` provider로 표시한다.
- 원본 오디오 업로드가 필요한 Gemini audio transcription 구현은 이식하지 않았다.

## 2. 모듈 구조

| 모듈 | 역할 | 영속성 경계 |
|---|---|---|
| `packages/domain/src/core.ts` | 조직, 프로젝트, 회의, 역할과 접근 검증 | 기존 서버 계약 |
| `packages/domain/src/audio.ts` | 음질 frame/report, artifact, normalization, VAD, overlap | `BROWSER_ONLY` |
| `packages/domain/src/speaker.ts` | cluster, assignment, event, diarization | `BROWSER_ONLY` |
| `packages/domain/src/transcript.ts` | 서버 confirmed transcript와 version/revision | 서버 PostgreSQL 대상 |
| `packages/domain/src/transcript-draft.ts` | raw/normalized/edited draft, run, candidate, alignment, word | `BROWSER_ONLY` |
| `packages/domain/src/minutes.ts` | 서버 minutes와 version/revision | 서버 PostgreSQL 대상 |
| `packages/domain/src/review.ts` | dictionary, edit history, extracted item, evidence, review queue | 단계 1에서는 `BROWSER_ONLY` |

`packages/domain/src/index.ts`는 위 모듈을 다시 export하므로 기존 `@meetingloop/domain` import 경로는 호환된다.

## 3. provider capability

`packages/ai/src/provider-capabilities.ts`에 다음 속성을 명시했다.

| 속성 | 의미 |
|---|---|
| `mode` | `demo` 또는 `real` |
| `requiresAudioUpload` | 원본 오디오가 브라우저 밖으로 나가야 하는지 여부 |
| `supportsServerPersistence` | 결과가 서버 영속 계층에 연결될 수 있는지 여부 |
| `acceptsConfirmedText` | 서버가 보유한 확정 전사만으로 실행 가능한지 여부 |
| `externalTransmission` | 확정 전사가 서버 밖 외부 AI 제공자에게 전송되는지 여부 |

- `stage1BrowserDemoPolicy`: deterministic browser 처리만 허용하고 서버 저장과 audio upload를 금지한다.
- `stage1ServerPolicy`: real confirmed-text provider와 서버 저장을 허용하지만 demo 및 audio upload를 금지한다.

단계 3 인계 감사에서 런타임 상태 표시를 보강했다. Ollama는 외부 전송 없음, Gemini는 확정 전사 외부 전송, deterministic mock은 외부 전송 없음으로 명시한다.

## 4. 이식한 deterministic 처리기

- 음질 분석 및 정규화 명령 생성
- VAD 및 overlap 후보 탐지
- diarization과 미확정 speaker assignment
- quick transcription 후보 생성
- precise analysis 후보 선택
- source separation 후보와 forced alignment
- meeting review item/evidence 생성

이 처리기들은 실제 AI 정확도를 보장하는 production 구현이 아니라 demo/test adapter다. 모든 audio/transcript 파생 결과는 브라우저 전용 계약을 반환한다.

## 5. 충돌 해소 기록

### 전사 schema 이름 충돌

로컬 버전의 `TranscriptSegment`는 raw/normalized/edited 필드를 포함했으나 현재 서버의 같은 이름은 확정 전사 저장 모델이다. 로컬 계약을 `TranscriptDraftSegment`로 분리해 서버 schema를 변경하지 않았다.

### audio artifact 저장 위치 충돌

로컬 구현의 `storageKey`와 `sourceStorageKey`는 서버 저장으로 오해될 수 있다. 단계 0의 D1~D3에 따라 `browserKey`와 `sourceBrowserKey`로 바꾸고 `persistence: BROWSER_ONLY`를 강제했다.

### provider 실행 범위 충돌

로컬의 deterministic provider와 real provider가 동일 package에 혼재했다. capability와 별도 test suite를 추가해 demo/real, audio upload, server persistence를 실행 전에 판정할 수 있게 했다.

## 6. 테스트 결과

2026-07-16 실행 결과:

- domain: 3 files, 17 tests 통과
- AI: 3 files, 10 tests 통과
- 전체 unit: 12 files, 40 tests 통과
- PostgreSQL integration: 9 files, 42 tests 통과, skip 0
- lint: 통과
- TypeScript project build: 통과
- 전체 workspace production build: 통과

추가된 핵심 검증:

- HIGH overlap의 `decisionEvidenceAllowed=true` 거부
- 화자 미확정 및 HIGH risk evidence 자동 확정 거부
- 서버 confirmed transcript 입력에 raw text 혼입 거부
- cross-tenant organization 검증 실패
- 음수 transcript version 거부
- raw audio upload가 필요한 provider의 서버 실행 거부

## 7. 단계 2 인계 사항

단계 1의 `BROWSER_ONLY`는 의도된 정책이며 단계 2 migration에 그대로 테이블을 추가하라는 의미가 아니다. 단계 2에서 PostgreSQL에 넣을 대상은 확정 전사와 회의록을 우선으로 하고, review/dictionary 파생 데이터의 서버 저장 여부는 단계 0 D3 정책을 변경하는 별도 결정 후 진행해야 한다.
