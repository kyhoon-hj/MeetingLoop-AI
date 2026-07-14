# CODEX MASTER BUILD LOOP — 회의 음성·회의록·개발 영향 분석 플랫폼

> 파일명 권장: `CODEX_MASTER_BUILD_LOOP.md`  
> 저장 위치: 저장소 루트  
> 기본 언어: 한국어 UI / 한국어 문서 / TypeScript 코드  
> 기본 시간대: `Asia/Seoul`  
> 실행 목표: 이 문서를 유일한 구현 기준으로 사용하여, 반응형 웹 기반 회의 음성 분석 서비스를 수직 기능 단위로 끝까지 구현한다.

---

## 0. Codex 실행 명령

Codex는 이 문서를 먼저 끝까지 읽고 저장소의 현재 상태를 조사한 다음, 아래의 **자율 개발 루프**를 반복한다.

```text
이 저장소의 루트에 있는 CODEX_MASTER_BUILD_LOOP.md를 제품·기술·검증의 단일 기준으로 사용하라.

1. 저장소와 실행 환경을 조사한다.
2. 문서의 IMPLEMENTATION BOARD에서 아직 완료되지 않은 가장 높은 우선순위 작업을 선택한다.
3. 사용자에게 추가 질문하지 않고 합리적인 기본값을 적용한다.
4. 가장 작은 수직 기능 단위로 구현한다.
5. DB, API, UI, 테스트, 접근성, 오류 처리를 함께 완성한다.
6. lint, typecheck, unit, integration, e2e, build를 실행한다.
7. 실패하면 원인을 수정하고 같은 검증을 다시 실행한다.
8. 검증을 통과한 작업만 [x]로 표시한다.
9. PROGRESS LEDGER에 변경 내용, 검증 결과, 남은 위험을 기록한다.
10. 다음 미완료 작업으로 이동한다.
11. P0와 P1 작업 및 최종 품질 게이트가 모두 통과할 때까지 루프를 계속한다.

절대 테스트를 우회하거나, 미구현 기능을 구현된 것처럼 표시하거나,
하드코딩된 성공 응답으로 완료 조건을 속이지 마라.
외부 AI 키가 없으면 Mock Provider로 전체 제품 흐름이 작동하게 만든 뒤
실제 Provider를 교체 가능한 어댑터 구조로 구현하라.
```

---

# 1. AUTONOMOUS BUILD LOOP

## 1.1 상태 머신

Codex는 매 반복마다 다음 상태를 순서대로 수행한다.

```text
DISCOVER
  → PLAN
  → IMPLEMENT
  → VERIFY
  → REVIEW
  → RECORD
  → REPEAT
```

### DISCOVER

- 이 문서와 현재 코드를 읽는다.
- 마지막 `PROGRESS LEDGER`를 확인한다.
- 실행 가능한 현재 상태를 직접 확인한다.
- 관련 테스트, DB 마이그레이션, API, 화면을 함께 조사한다.
- 이미 정상 구현된 코드를 불필요하게 다시 작성하지 않는다.

### PLAN

- 한 번의 루프에서는 하나의 수직 기능 또는 강하게 연관된 작은 묶음만 선택한다.
- 작업 범위에는 가능한 한 다음이 함께 포함되어야 한다.
  - 데이터 모델
  - 서버 로직
  - API
  - UI
  - 로딩·빈 상태·오류 상태
  - 권한
  - 테스트
  - 문서 또는 상태 보드 갱신
- 큰 기능은 사용자가 실제로 확인 가능한 작은 흐름으로 나눈다.

### IMPLEMENT

- 임시 코드보다 실제로 유지 가능한 코드를 작성한다.
- 타입 안전성, 입력 검증, 권한 검사를 기본값으로 적용한다.
- AI 응답은 스키마 검증을 통과한 뒤에만 저장한다.
- 비동기 작업은 재시도 가능하고 중복 실행에 안전하게 만든다.
- 모든 중요한 데이터에는 생성자, 생성 시각, 수정 시각을 기록한다.

### VERIFY

아래 명령을 프로젝트에 맞게 구성하고 반복 실행한다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

DB 또는 작업 큐가 필요한 테스트는 Docker Compose 기반 테스트 환경에서 실행한다.

### REVIEW

다음 항목을 자체 검토한다.

- 요구사항 누락 여부
- 권한 우회 가능성
- 모바일 화면 파손 여부
- 원문과 AI 결과 혼합 여부
- 근거 없는 AI 결과 저장 여부
- 시간대 처리 오류
- 중복 작업 생성 가능성
- 민감정보 로그 노출
- 빈 상태와 오류 상태 누락
- 테스트가 실제 동작을 검증하는지 여부

### RECORD

완료된 항목만 체크하고 `PROGRESS LEDGER`에 다음을 남긴다.

- 완료한 수직 기능
- 주요 파일
- 실행한 검증
- 검증 결과
- 남은 위험
- 다음 추천 작업

### REPEAT

- P0 → P1 → P2 순으로 처리한다.
- 같은 우선순위에서는 의존성이 적고 사용자 가치가 높은 항목부터 처리한다.
- 외부 연동이 막혀도 Mock Provider와 Adapter를 완성하여 제품 흐름을 멈추지 않는다.

---

## 1.2 질문 없이 적용할 기본 의사결정

명시되지 않은 세부사항은 다음 기본값을 사용한다.

- 앱 이름: `MeetingLoop AI`
- 기본 언어: 한국어
- 기본 시간대: `Asia/Seoul`
- 날짜 저장: UTC
- 날짜 표시: 사용자 시간대로 변환
- 패키지 관리자: `pnpm`
- 저장소 형태: TypeScript 모노레포
- 웹 프레임워크: Next.js App Router
- 스타일: Tailwind CSS + 접근 가능한 UI primitive
- DB: PostgreSQL
- ORM: Prisma 또는 동등한 타입 안전 ORM
- 벡터 검색: PostgreSQL `pgvector`, 미지원 시 일반 검색으로 graceful fallback
- 작업 큐: Redis + BullMQ 또는 동등한 큐
- 파일 저장: S3 호환 인터페이스
- 로컬 저장소: MinIO
- 인증: 안전한 쿠키 세션 기반 인증
- 비밀번호 해시: Argon2 계열
- 입력 검증: Zod
- 단위·통합 테스트: Vitest
- E2E: Playwright
- 로컬 인프라: Docker Compose
- 오디오 정규화: FFmpeg
- 실제 AI 연동: Provider Adapter
- AI 키 미설정: 결정적 Mock Provider
- 내보내기: Markdown, JSON, PDF
- 자동 저장 주기: 변경 후 debounce 저장
- 모바일 업로드 실패: IndexedDB 임시 보관 후 재시도
- AI 생성 제목: 자동 임시 제목으로 저장하고 사용자가 확정 가능
- AI 결과: 기본적으로 `검토 필요`
- 외부 작업 생성: 사용자 승인 후에만 허용

---

## 1.3 금지 사항

- 원본 음성 또는 원문 전사를 AI 정제본으로 덮어쓰지 않는다.
- 제안, 질문, 추측을 확정 결정으로 저장하지 않는다.
- 원문에 없는 담당자나 기한을 생성하지 않는다.
- 근거 발언이 없는 결정·할 일·리스크를 확정 상태로 저장하지 않는다.
- 사용자 승인 없이 외부 이슈, 문서, 코드 변경을 생성하지 않는다.
- 인증·권한 검사를 프론트엔드에만 의존하지 않는다.
- 조직 간 데이터가 섞일 수 있는 쿼리를 작성하지 않는다.
- API 키, 토큰, 음성 URL을 로그에 출력하지 않는다.
- 테스트 통과를 위해 기능을 삭제하거나 검증을 약화하지 않는다.
- `TODO`만 남기고 완료 체크하지 않는다.
- 실패를 숨기는 빈 `catch`를 사용하지 않는다.
- 모바일 브라우저 녹음 실패 시 사용자 데이터를 조용히 폐기하지 않는다.

---

# 2. PRODUCT VISION

## 2.1 한 문장 정의

> 회의 음성을 누가 어떤 안건에서 무엇을 말했고, 무엇이 결정되었으며, 그 결과 어떤 문서·기능·API·DB·코드·테스트가 변경되어야 하는지 분석하고 실행 상태까지 추적하는 반응형 웹 플랫폼.

## 2.2 핵심 가치

1. **회의 기록 신뢰성**
   - 원본 음성
   - 원문 전사
   - AI 정제본
   - 사용자 확정본
   - 변경 이력
   를 서로 분리한다.

2. **근거 기반 분석**
   - 모든 결정, 할 일, 리스크, 변경 요청은 음성 구간과 원문 발언을 근거로 가진다.

3. **회의에서 실행으로 연결**
   - 회의 결과를 담당자, 기한, 문서, 개발 작업, 테스트로 연결한다.

4. **모바일과 PC의 연속 작업**
   - 모바일에서 녹음하고 PC에서 상세 검토하며 다시 모바일에서 승인할 수 있다.

5. **자동화하되 확정은 통제**
   - AI가 제목, 요약, 주간회의록, 작업 초안을 생성하지만 중요한 변경은 사람이 승인한다.

---

# 3. TARGET USERS AND ROLES

## 3.1 사용자 유형

- 조직 관리자
- 프로젝트 관리자
- 회의 주최자
- 회의 참석자
- 회의록 검토자
- 개발자
- 기획자
- QA
- 읽기 전용 외부 참여자

## 3.2 권한 역할

| 역할 | 주요 권한 |
|---|---|
| `ORG_ADMIN` | 조직 설정, 구성원, 보존 정책, 모든 프로젝트 관리 |
| `PROJECT_ADMIN` | 프로젝트 설정, 문서, 회의, 보고서 관리 |
| `EDITOR` | 회의 생성, 녹음, 전사 수정, AI 결과 검토 |
| `MEMBER` | 허용된 회의 열람, 본인 할 일 수정 |
| `VIEWER` | 읽기 전용 |
| `EXTERNAL` | 명시적으로 공유된 회의만 제한 열람 |

모든 서버 쿼리는 `organizationId`와 필요한 경우 `projectId` 범위를 강제한다.

---

# 4. SCOPE

## 4.1 P0 — 반드시 동작해야 하는 MVP

- 반응형 웹
- 회원가입·로그인·로그아웃
- 조직·프로젝트 생성
- 모바일/PC 브라우저 녹음
- 원본 음성 로컬 보관
- 확인된 전사 TXT 서버 저장
- 처리 상태 표시
- 타임스탬프 전사
- 화자 A/B/C 분리 결과 저장
- 화자 이름 일괄 매핑
- 안건 자동 분리 및 수동 수정
- 전체 요약과 안건별 요약
- 결정, 할 일, 리스크, 미결 질문 추출
- 각 결과의 근거 음성 연결
- 회의 제목 후보 자동 생성
- 회의 제목 확정 및 변경 이력
- 주간 단일 회의록
- 여러 회의를 묶은 주간 통합 보고서
- 회의록 편집·승인
- 프로젝트별 보관
- 키워드 검색
- Markdown, JSON, PDF 내보내기
- 감사 로그
- 테스트와 데모 데이터

## 4.2 P1 — 첫 확장

- 의미 검색
- 프로젝트 문서 업로드 및 검색
- 개발 영향 분석
- API·DB·화면·테스트 변경 초안
- 이전 결정과 충돌 탐지
- 회의 템플릿
- 알림 센터
- PWA 설치 지원
- 오프라인 녹음 임시 보관
- 이메일 또는 캘린더 메타데이터 Adapter
- 외부 작업 생성 전 승인 화면

## 4.3 P2 — 이후 확장

- 실시간 부분 전사
- 온라인 회의 플랫폼 연동
- GitHub/Jira/Notion 연동
- 음성 프로필 기반 화자 자동 후보
- 다국어
- 조직 지식 그래프
- 실제 코드 변경 제안
- 고급 관리자 분석 지표

---

# 5. RESPONSIVE UX REQUIREMENTS

## 5.1 공통 원칙

- 핵심 기능은 모바일과 PC 모두에서 수행 가능해야 한다.
- 마우스 전용 상호작용을 만들지 않는다.
- 모든 버튼은 키보드 접근이 가능해야 한다.
- 포커스 상태를 명확히 표시한다.
- 색상만으로 상태를 구분하지 않는다.
- 저장 상태와 분석 상태를 항상 보이게 한다.
- 음성 재생 위치와 전사 구간이 동기화되어야 한다.

## 5.2 화면 크기별 레이아웃

### Mobile `< 768px`

- 하단 내비게이션
- 한 화면 한 작업
- 탭:
  - 요약
  - 원문
  - 결정
  - 할 일
  - 개발 영향
- 하단 고정 미니 플레이어
- 큰 녹음 버튼
- 스와이프에 의존하지 않는 명시적 버튼
- 화자 지정은 바텀 시트
- 결정 승인·반려는 카드 단위
- 입력 중 자동 저장
- 네트워크 복구 시 자동 업로드 재개

### Tablet `768px–1199px`

- 좌측 안건 목록
- 우측 콘텐츠
- 플레이어 고정
- 결과 패널은 drawer 또는 탭

### Desktop `>= 1200px`

3단 레이아웃:

```text
[안건/목차] [플레이어 + 전사] [결정/할 일/리스크/개발 영향]
```

## 5.3 주요 반응형 페이지

- 로그인
- 대시보드
- 프로젝트 목록
- 프로젝트 상세
- 회의 목록
- 새 회의
- 녹음 화면
- 업로드 화면
- 분석 진행 화면
- 회의 검토 화면
- 주간 보고서
- 검색
- 내 할 일
- 관리자 설정

---

# 6. RECOMMENDED ARCHITECTURE

## 6.1 모노레포

```text
/
├─ apps/
│  ├─ web/                 # Next.js 반응형 웹
│  └─ worker/              # 비동기 처리 워커
├─ packages/
│  ├─ db/                  # ORM schema, migrations, seed
│  ├─ domain/              # 도메인 타입과 서비스
│  ├─ ai/                  # STT/LLM/Diarization adapters
│  ├─ storage/             # S3/MinIO adapters
│  ├─ queue/               # 작업 큐
│  ├─ auth/                # 세션과 권한
│  ├─ ui/                  # 공유 UI 컴포넌트
│  ├─ config/              # eslint, tsconfig
│  └─ test-utils/
├─ infra/
│  ├─ docker-compose.yml
│  └─ scripts/
├─ fixtures/
│  ├─ audio/
│  ├─ transcripts/
│  └─ ai-results/
├─ CODEX_MASTER_BUILD_LOOP.md
├─ package.json
├─ pnpm-workspace.yaml
└─ README.md
```

## 6.2 런타임 컴포넌트

```text
Browser
  ├─ Recording / Upload / Review UI
  └─ REST or typed RPC
        ↓
Web Server
  ├─ Auth / RBAC
  ├─ Project / Meeting API
  ├─ Signed upload URL
  ├─ Search
  └─ Export
        ↓
PostgreSQL + pgvector
Redis Queue
S3-compatible Storage
        ↓
Worker
  ├─ audio.normalize
  ├─ audio.transcribe
  ├─ audio.diarize
  ├─ transcript.normalize
  ├─ agenda.detect
  ├─ meeting.extract
  ├─ title.generate
  ├─ minutes.generate
  ├─ weekly.generate
  ├─ impact.analyze
  └─ export.render
```

## 6.3 Provider Adapter

```ts
interface SpeechToTextProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}

interface DiarizationProvider {
  diarize(input: DiarizationInput): Promise<DiarizationResult>;
}

interface MeetingAnalysisProvider {
  analyzeMeeting(input: MeetingAnalysisInput): Promise<MeetingAnalysisResult>;
}

interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}
```

구현체:

- `MockSpeechToTextProvider`
- `MockDiarizationProvider`
- `MockMeetingAnalysisProvider`
- `ConfiguredSpeechToTextProvider`
- `ConfiguredDiarizationProvider`
- `ConfiguredMeetingAnalysisProvider`

환경 변수에 실제 키가 없으면 Mock Provider를 사용한다. Mock은 fixture 파일을 읽어 항상 같은 결과를 반환하여 E2E 테스트를 안정적으로 만든다.

---

# 7. LOCAL DEVELOPMENT

## 7.1 필수 명령

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## 7.2 품질 명령

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

## 7.3 환경 변수 예시

`.env.example`을 생성한다.

```dotenv
NODE_ENV=development
APP_URL=http://localhost:3000
APP_TIMEZONE=Asia/Seoul

DATABASE_URL=postgresql://meetingloop:meetingloop@localhost:5432/meetingloop
REDIS_URL=redis://localhost:6379

S3_ENDPOINT=http://localhost:9000
S3_REGION=local
S3_BUCKET=meetingloop
S3_ACCESS_KEY=meetingloop
S3_SECRET_KEY=meetingloop-secret
S3_FORCE_PATH_STYLE=true

SESSION_SECRET=replace-with-long-random-value

AI_MODE=mock
STT_PROVIDER=mock
DIARIZATION_PROVIDER=mock
ANALYSIS_PROVIDER=mock
EMBEDDING_PROVIDER=mock

AI_API_KEY=
STT_API_KEY=
DIARIZATION_API_KEY=

MAX_UPLOAD_BYTES=1073741824
AUDIO_RETENTION_DAYS=365
SIGNED_URL_TTL_SECONDS=900
```

비밀값은 커밋하지 않는다.

---

# 8. CORE DOMAIN MODEL

## 8.1 필수 엔터티

### Organization

```text
id
name
slug
timezone
retentionDays
createdAt
updatedAt
```

### User

```text
id
email
passwordHash
displayName
locale
timezone
createdAt
updatedAt
```

### Membership

```text
id
organizationId
userId
role
status
createdAt
```

### Project

```text
id
organizationId
name
key
description
status
createdBy
createdAt
updatedAt
```

### Meeting

```text
id
organizationId
projectId
title
titleStatus             # PROVISIONAL | CONFIRMED
meetingType
status                  # DRAFT | RECORDING | UPLOADING | PROCESSING | REVIEW | APPROVED | FAILED | ARCHIVED
startedAt
endedAt
timezone
sourceType              # BROWSER_RECORDING | FILE_UPLOAD | IMPORT
createdBy
approvedBy
approvedAt
createdAt
updatedAt
```

### MeetingTitleCandidate

```text
id
meetingId
title
rank
confidence
reason
promptVersion
createdAt
```

### MeetingTitleHistory

```text
id
meetingId
previousTitle
newTitle
changedBy
changeSource            # AI | USER | IMPORT
createdAt
```

### Participant

```text
id
meetingId
userId nullable
displayName
roleLabel
organizationLabel
speakerClusterId nullable
identityStatus          # UNKNOWN | SUGGESTED | CONFIRMED
identityConfidence nullable
identitySource          # MANUAL | CALENDAR | SELF_INTRO | VOICE_PROFILE | UNKNOWN
createdAt
updatedAt
```

### Recording

```text
id
meetingId
storageKey
originalFileName
mimeType
sizeBytes
durationMs
checksum
uploadStatus
normalizedStorageKey nullable
createdAt
```

### UploadPart

```text
id
recordingId
partNumber
checksum
sizeBytes
status
createdAt
```

### ProcessingJob

```text
id
meetingId
recordingId nullable
jobType
status                  # QUEUED | RUNNING | SUCCEEDED | FAILED | CANCELED
progress
attempt
maxAttempts
idempotencyKey
errorCode nullable
errorMessageSanitized nullable
startedAt nullable
completedAt nullable
createdAt
updatedAt
```

### TranscriptSegment

```text
id
meetingId
recordingId
sequence
startMs
endMs
speakerClusterId
speakerParticipantId nullable
rawText
normalizedText
editedText nullable
speechConfidence nullable
speakerConfidence nullable
language
isOverlapping
createdAt
updatedAt
```

표시 텍스트 우선순위:

```text
editedText ?? normalizedText ?? rawText
```

원문 `rawText`는 수정하지 않는다.

### Agenda

```text
id
meetingId
parentAgendaId nullable
title
summary
sequence
startMs
endMs
status
source                 # PRESET | AI | USER
confidence nullable
createdAt
updatedAt
```

### ExtractedItem

하나의 공통 테이블 또는 타입별 테이블을 사용할 수 있다.

```text
id
meetingId
agendaId nullable
type                   # DECISION | PROPOSAL | ACTION_ITEM | RISK | ISSUE | OPEN_QUESTION | REQUIREMENT_CHANGE | DOCUMENT_CHANGE
title
content
status
ownerParticipantId nullable
dueAt nullable
priority nullable
confidence
reviewStatus           # NEEDS_REVIEW | APPROVED | REJECTED | EDITED
sourceModel
promptVersion
createdByType          # AI | USER | IMPORT
createdAt
updatedAt
```

### EvidenceLink

```text
id
meetingId
entityType
entityId
transcriptSegmentId
audioStartMs
audioEndMs
evidenceText
createdAt
```

### ActionItemDetail

```text
extractedItemId
assigneeUserId nullable
assigneeText nullable
dueDateSource           # EXPLICIT | USER | NONE
externalSystem nullable
externalTaskId nullable
externalTaskUrl nullable
workflowStatus          # OPEN | IN_PROGRESS | BLOCKED | DONE | CANCELED
completedAt nullable
```

### DecisionDetail

```text
extractedItemId
decisionStatus          # PROPOSED | CONFIRMED | REJECTED | DEFERRED | REVERSED | SUPERSEDED
decidedByParticipantId nullable
approvedByUserId nullable
effectiveAt nullable
supersedesDecisionId nullable
```

### ChangeRequest

```text
id
meetingId
decisionItemId nullable
projectId
changeType              # REQUIREMENT | UI | API | DATABASE | BACKEND | FRONTEND | INFRA | TEST | DOCUMENT
title
currentState
targetState
impactSummary
riskLevel
reviewStatus
createdAt
updatedAt
```

### ChangeImpactItem

```text
id
changeRequestId
layer
targetName
targetReference nullable
changeDescription
testSuggestion nullable
confidence
createdAt
```

### ProjectDocument

```text
id
organizationId
projectId
title
documentType
storageKey nullable
textContent nullable
version
status
createdBy
createdAt
updatedAt
```

### DocumentChunk

```text
id
documentId
sequence
content
embedding nullable
metadataJson
createdAt
```

### WeeklyReport

```text
id
organizationId
projectId nullable
teamKey nullable
weekStart
weekEnd
title
status                  # DRAFT | REVIEW | APPROVED | ARCHIVED
scopeJson
contentJson
renderedMarkdown
createdBy
approvedBy nullable
approvedAt nullable
createdAt
updatedAt
```

### WeeklyReportSource

```text
id
weeklyReportId
meetingId
included
createdAt
```

### SavedSearch

```text
id
organizationId
userId
name
queryJson
createdAt
```

### Notification

```text
id
organizationId
userId
type
title
body
readAt nullable
entityType nullable
entityId nullable
createdAt
```

### AuditLog

```text
id
organizationId
actorUserId nullable
action
entityType
entityId
metadataJson
ipHash nullable
userAgentSummary nullable
createdAt
```

### PromptVersion

```text
id
taskType
version
schemaVersion
promptHash
active
createdAt
```

---

# 9. MEETING PROCESSING PIPELINE

## 9.1 상태 흐름

```text
DRAFT
  → RECORDING
  → UPLOADING
  → PROCESSING
  → REVIEW
  → APPROVED
  → ARCHIVED
```

실패 시:

```text
PROCESSING → FAILED → RETRYING → PROCESSING
```

## 9.2 작업 순서

```text
1. upload.complete
2. audio.normalize
3. audio.metadata
4. audio.transcribe
5. audio.diarize
6. transcript.align-speakers
7. transcript.normalize
8. participant.suggest
9. agenda.detect
10. meeting.extract-items
11. title.generate
12. minutes.generate
13. search.index
14. meeting.ready-for-review
```

## 9.3 작업 안전성

- 각 작업은 `idempotencyKey`를 가진다.
- 같은 입력으로 중복 실행되어도 결과가 중복 생성되지 않아야 한다.
- 실패 메시지는 사용자용과 내부 로그용을 분리한다.
- 재시도 횟수 초과 시 `FAILED`.
- 사용자가 재처리를 요청할 수 있다.
- 성공한 앞 단계는 불필요하게 다시 실행하지 않는다.
- 원본 오디오의 checksum을 보관한다.

## 9.4 진행률

사용자에게 다음과 같이 보여준다.

```text
업로드 100%
오디오 정리 완료
음성 인식 72%
화자 분석 대기
안건 분석 대기
회의록 생성 대기
```

진행률을 가짜 타이머로 만들지 않고 실제 작업 상태에 연결한다.

---

# 10. BROWSER RECORDING AND UPLOAD

## 10.1 녹음

- 브라우저 `MediaRecorder`를 사용한다.
- 장치 권한 거부를 명확히 처리한다.
- 녹음 시작 전에 녹음 동의 확인 UI를 제공한다.
- 녹음 중 다음을 표시한다.
  - 경과 시간
  - 입력 레벨
  - 일시 중지
  - 재개
  - 종료
  - 네트워크 상태
  - 업로드 상태
- 오디오를 일정 청크로 나누어 업로드한다.
- 네트워크 단절 시 IndexedDB에 청크를 저장한다.
- 재접속 시 미전송 청크를 이어서 업로드한다.
- 페이지 이탈 경고를 제공한다.
- 최종 조립 후 checksum과 duration을 확인한다.

## 10.2 파일 업로드

- drag & drop
- 모바일 파일 선택
- 최대 용량 검증
- MIME 및 확장자 검증
- 진행률
- 일시 실패 재시도
- 중복 파일 감지
- 악성 파일 및 예상치 못한 형식 거부
- 업로드 완료 후 자동 처리 시작

## 10.3 로컬 개발

실제 음성 처리 키가 없을 때:

- fixture 오디오 업로드
- 파일명 또는 checksum과 fixture transcript 매핑
- Mock Provider가 화자, 안건, 결정, 할 일을 반환
- E2E가 전체 검토 화면까지 진행 가능

---

# 11. SPEAKER DIARIZATION AND IDENTITY

## 11.1 분리와 식별을 구분

1. **화자 분리**
   - Speaker A/B/C 클러스터 생성

2. **참석자 식별**
   - 클러스터를 실제 참석자와 연결

## 11.2 사용자 흐름

- 분석 완료 후 미확정 화자를 표시한다.
- 사용자가 Speaker A에 이름을 지정한다.
- 같은 클러스터 전체에 일괄 반영한다.
- 일부 구간만 다른 화자로 수정할 수 있다.
- 수정 이력을 기록한다.
- 신뢰도가 낮은 겹침 발언을 강조한다.

## 11.3 자동 후보

후보 생성에 사용할 수 있는 정보:

- 사전 참석자 명단
- 캘린더 메타데이터
- 자기소개 문장
- 사용자의 과거 수동 매핑
- 명시적 동의를 받은 음성 프로필

음성 생체 프로필은 기본 비활성화한다.

---

# 12. AGENDA AND UTTERANCE CLASSIFICATION

## 12.1 안건 구조

```text
Meeting
  ├─ Agenda
  │   ├─ Sub-agenda
  │   ├─ Transcript segments
  │   ├─ Decisions
  │   ├─ Action items
  │   └─ Open questions
  └─ Agenda
```

## 12.2 안건 감지 입력

- 사전 입력 안건
- 회의 제목
- 프로젝트명
- 반복 회의 템플릿
- 주제 의미 변화
- 발표자 전환
- 명시적 전환 문구
- 긴 침묵
- 첨부 문서 제목

## 12.3 발언 유형

```text
AGENDA_INTRO
BACKGROUND_FACT
QUESTION
ANSWER
OPINION
PROPOSAL
ISSUE
RISK
DECISION
DEFERRED
REJECTED
ACTION_ITEM
REQUIREMENT_CHANGE
DOCUMENT_CHANGE
OPEN_QUESTION
REFERENCE
SMALL_TALK
```

`PROPOSAL`과 `DECISION`은 별도 검증한다.

---

# 13. AI STRUCTURED OUTPUT

AI 결과는 반드시 Zod 또는 동등한 런타임 스키마 검증을 거친다.

## 13.1 회의 분석 결과

```json
{
  "meetingSummary": "string",
  "agendas": [
    {
      "title": "string",
      "summary": "string",
      "startMs": 0,
      "endMs": 1000,
      "confidence": 0.91,
      "segmentIds": ["seg_1"]
    }
  ],
  "items": [
    {
      "type": "ACTION_ITEM",
      "title": "환불 API 오류 코드 정리",
      "content": "오류 코드를 문서와 구현에서 일치시키기로 함",
      "agendaIndex": 0,
      "ownerText": "김민수",
      "dueAt": null,
      "confidence": 0.86,
      "needsReview": true,
      "evidenceSegmentIds": ["seg_128", "seg_129"],
      "missingFields": ["dueAt"]
    }
  ]
}
```

## 13.2 검증 규칙

- `evidenceSegmentIds`가 존재하지 않으면 AI 항목 저장을 거부하거나 `NEEDS_REVIEW`로 격리한다.
- segment가 다른 meeting에 속하면 거부한다.
- 기한이 발언에 없으면 `null`.
- 담당자가 불확실하면 `ownerText`와 낮은 confidence만 저장한다.
- 결정이 제안 문장만 근거로 하면 `PROPOSED`.
- 스키마 오류 시 한 번의 구조화 재요청 후 실패 처리한다.
- 모델 원본 출력 전체를 사용자에게 노출하지 않는다.
- 프롬프트 버전과 스키마 버전을 저장한다.

---

# 14. AUTO MEETING TITLE

## 14.1 입력

- 프로젝트명
- 회의 유형
- 사전 안건
- 캘린더 제목
- 핵심 안건
- 확정 또는 제안된 결정
- 회의 일자
- 반복 회의 정보

## 14.2 출력

- 최대 3개 후보
- 각 후보의 confidence
- 짧은 생성 이유
- 조직 제목 템플릿 적용 결과

예:

```text
1. [회원 시스템] 탈퇴·재가입 제한 정책 개발 회의
2. [회원 시스템] 재가입 제한 API 및 데이터 구조 검토
3. [회원 시스템] 회원 탈퇴 정책 변경과 배포 계획
```

## 14.3 규칙

- 제목 길이는 지나치게 길지 않게 한다.
- 잡담이나 개인 정보는 제목에 넣지 않는다.
- 반복 회의는 조직 템플릿을 우선한다.
- 자동 선택한 제목은 `PROVISIONAL`.
- 사용자 확정 후 `CONFIRMED`.
- 변경 전후 제목을 이력에 저장한다.

## 14.4 조직 템플릿 예시

```text
[{project}] {mainAgenda}
[{team}] 주간회의 - {year}년 {month}월 {weekOfMonth}주차
[{meetingType}] {mainDecision} - {date}
```

---

# 15. WEEKLY MEETING MINUTES AND REPORTS

## 15.1 두 가지 모드

### A. 반복 주간회의의 단일 회의록

한 번의 주간회의를 표준 템플릿으로 정리한다.

```text
회의 개요
지난주 작업
완료
진행 중
막힘
이번 주 계획
결정 사항
할 일
리스크
미결 질문
```

### B. 여러 회의를 통합한 주간 보고서

한 주 동안 선택된 프로젝트 또는 팀의 여러 회의를 통합한다.

```text
주간 요약
핵심 결정
완료된 작업
진행 중 작업
지연·막힘
새로운 요구사항
개발 변경 영향
리스크
미해결 질문
다음 주 계획
출처 회의
```

## 15.2 주간 범위

- 기본 주 시작: 월요일 00:00
- 기본 주 종료: 일요일 23:59:59
- 시간대: 조직 시간대
- 범위 변경 가능
- 프로젝트, 팀, 참석자, 태그로 필터 가능
- 포함 회의를 사용자가 수정 가능

## 15.3 제목 자동 생성

```text
[개발팀] 주간회의록 2026년 7월 2주차
[프로젝트 A] 주간 통합 보고서 2026-07-06 ~ 2026-07-12
```

## 15.4 중복 제거

같은 결정이나 작업이 여러 회의에서 반복되면:

- 최신 상태를 대표 항목으로 표시
- 출처 회의는 모두 연결
- 이전 표현과 충돌하면 충돌 표시
- 완료와 미완료 상태를 합쳐 버리지 않는다

## 15.5 승인

- AI 생성 초안
- 사용자 편집
- 검토 요청
- 승인
- 승인 후 PDF/Markdown 내보내기

---

# 16. DEVELOPMENT IMPACT ANALYSIS

## 16.1 목적

회의 결정과 프로젝트 문서를 비교해 무엇을 개발·수정해야 하는지 초안을 만든다.

## 16.2 입력

- 승인 또는 검토 중인 결정
- 요구사항 문서
- 정책 문서
- 화면 정의
- API 명세
- DB 스키마 설명
- 기존 작업
- 테스트 문서
- 이전 회의 결정

## 16.3 결과 구조

```json
{
  "changeRequest": {
    "title": "회원 탈퇴 후 30일 재가입 제한",
    "currentState": "탈퇴 직후 동일 이메일 재가입 가능",
    "targetState": "탈퇴 후 30일 동안 동일 이메일 재가입 차단",
    "riskLevel": "MEDIUM"
  },
  "impacts": [
    {
      "layer": "BACKEND",
      "targetName": "회원 가입 검증",
      "changeDescription": "탈퇴 이력 및 제한 기간 검증 추가",
      "testSuggestion": "29일, 30일 경계 테스트",
      "confidence": 0.85
    },
    {
      "layer": "DATABASE",
      "targetName": "탈퇴 이력",
      "changeDescription": "재가입 제한 판정용 이력 또는 비식별 해시 저장",
      "testSuggestion": "보존 만료 및 삭제 정책 검증",
      "confidence": 0.76
    }
  ],
  "risks": [
    "개인정보 보존 범위 증가 가능성"
  ],
  "openQuestions": [
    "30일을 720시간으로 계산할지 날짜 기준으로 계산할지"
  ]
}
```

## 16.4 레이어

```text
REQUIREMENT
POLICY
UI
FRONTEND
BACKEND
API
DATABASE
INFRA
SECURITY
TEST
DOCUMENT
OPERATIONS
```

## 16.5 안전 규칙

- 실제 코드 변경을 자동 적용하지 않는다.
- 근거 문서가 없으면 추정임을 표시한다.
- 파일 경로나 API명을 만들어내지 않는다.
- 외부 작업 생성은 승인 후에만 수행한다.
- 충돌하는 이전 결정이 있으면 먼저 표시한다.

---

# 17. SEARCH AND RECORD MANAGEMENT

## 17.1 검색 대상

- 회의 제목
- 원문 전사
- 정제 전사
- 안건
- 결정
- 할 일
- 리스크
- 미결 질문
- 프로젝트 문서
- 주간 보고서
- 참석자
- 날짜
- 상태

## 17.2 필터

- 조직
- 프로젝트
- 기간
- 회의 유형
- 참석자
- 화자
- 결정 상태
- 할 일 상태
- 승인 여부
- 위험 수준

## 17.3 결과

- 일치 문구 강조
- 음성 타임스탬프로 이동
- 권한이 없는 회의는 결과에서 제외
- 검색어를 AuditLog에 원문으로 무조건 저장하지 않는다.
- 의미 검색 미지원 시 키워드 검색을 정상 제공한다.

## 17.4 자연어 검색 P1

예:

```text
결제 취소 기능에 대해 최근 3개월 동안 변경된 결정을 보여줘.
김민수가 담당하기로 했지만 아직 끝나지 않은 항목은?
로그인 정책과 충돌하는 회의 결정이 있어?
```

자연어 질의는 허용된 구조화 필터와 검색으로 변환하고, 생성된 답변에는 출처를 연결한다.

---

# 18. API CONTRACT

REST 경로 예시이며 구현 시 일관된 규칙을 유지한다.

## 18.1 Auth

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/session
```

## 18.2 Organization / Project

```text
GET    /api/organizations
POST   /api/organizations
GET    /api/organizations/:orgId
PATCH  /api/organizations/:orgId

GET    /api/projects
POST   /api/projects
GET    /api/projects/:projectId
PATCH  /api/projects/:projectId
```

## 18.3 Meeting

```text
GET    /api/meetings
POST   /api/meetings
GET    /api/meetings/:meetingId
PATCH  /api/meetings/:meetingId
DELETE /api/meetings/:meetingId
POST   /api/meetings/:meetingId/archive
```

## 18.4 Recording / Upload

```text
POST   /api/meetings/:meetingId/recordings
POST   /api/recordings/:recordingId/upload/init
POST   /api/recordings/:recordingId/upload/part
POST   /api/recordings/:recordingId/upload/complete
GET    /api/recordings/:recordingId/playback-url
POST   /api/recordings/:recordingId/retry
```

## 18.5 Processing

```text
GET    /api/meetings/:meetingId/jobs
POST   /api/meetings/:meetingId/process
POST   /api/meetings/:meetingId/reprocess
```

## 18.6 Transcript

```text
GET    /api/meetings/:meetingId/transcript
PATCH  /api/transcript-segments/:segmentId
POST   /api/meetings/:meetingId/speakers/map
POST   /api/meetings/:meetingId/transcript/split
POST   /api/meetings/:meetingId/transcript/merge
```

## 18.7 Agenda / Extracted Items

```text
GET    /api/meetings/:meetingId/agendas
POST   /api/meetings/:meetingId/agendas
PATCH  /api/agendas/:agendaId
DELETE /api/agendas/:agendaId

GET    /api/meetings/:meetingId/items
POST   /api/meetings/:meetingId/items
PATCH  /api/items/:itemId
POST   /api/items/:itemId/approve
POST   /api/items/:itemId/reject
GET    /api/items/:itemId/evidence
```

## 18.8 Title

```text
GET    /api/meetings/:meetingId/title-candidates
POST   /api/meetings/:meetingId/title-candidates/generate
POST   /api/meetings/:meetingId/title/confirm
GET    /api/meetings/:meetingId/title-history
```

## 18.9 Minutes / Weekly Reports

```text
GET    /api/meetings/:meetingId/minutes
POST   /api/meetings/:meetingId/minutes/generate
PATCH  /api/meetings/:meetingId/minutes
POST   /api/meetings/:meetingId/minutes/approve

GET    /api/weekly-reports
POST   /api/weekly-reports
GET    /api/weekly-reports/:reportId
PATCH  /api/weekly-reports/:reportId
POST   /api/weekly-reports/:reportId/generate
POST   /api/weekly-reports/:reportId/approve
```

## 18.10 Documents / Impact

```text
GET    /api/projects/:projectId/documents
POST   /api/projects/:projectId/documents
GET    /api/documents/:documentId
DELETE /api/documents/:documentId

POST   /api/meetings/:meetingId/impact-analysis
GET    /api/meetings/:meetingId/change-requests
PATCH  /api/change-requests/:changeRequestId
```

## 18.11 Search / Export

```text
GET    /api/search
POST   /api/search/natural-language

POST   /api/meetings/:meetingId/export
POST   /api/weekly-reports/:reportId/export
GET    /api/exports/:exportId
```

## 18.12 응답 규칙

성공:

```json
{
  "data": {},
  "meta": {}
}
```

오류:

```json
{
  "error": {
    "code": "MEETING_NOT_FOUND",
    "message": "회의를 찾을 수 없습니다.",
    "requestId": "req_xxx",
    "fieldErrors": {}
  }
}
```

- 내부 stack trace는 노출하지 않는다.
- 오류 code는 테스트 가능한 상수로 관리한다.
- mutation API는 CSRF 방어를 적용한다.
- 업로드 API는 파일 크기와 권한을 서버에서 재검증한다.

---

# 19. WEB ROUTES

```text
/
├─ /login
├─ /register
├─ /dashboard
├─ /projects
├─ /projects/[projectId]
├─ /projects/[projectId]/meetings
├─ /meetings/new
├─ /meetings/[meetingId]
├─ /meetings/[meetingId]/record
├─ /meetings/[meetingId]/processing
├─ /meetings/[meetingId]/review
├─ /meetings/[meetingId]/impact
├─ /weekly-reports
├─ /weekly-reports/new
├─ /weekly-reports/[reportId]
├─ /tasks
├─ /search
└─ /settings
   ├─ /profile
   ├─ /organization
   ├─ /members
   ├─ /retention
   └─ /integrations
```

---

# 20. KEY UI COMPONENTS

```text
AppShell
ResponsiveSidebar
MobileBottomNavigation
TopBar
ProjectSwitcher
MeetingStatusBadge
ProcessingProgress
RecordingControl
AudioWaveform
AudioMiniPlayer
TranscriptViewer
TranscriptSegmentEditor
SpeakerBadge
SpeakerMappingSheet
AgendaTree
AgendaEditor
ExtractedItemCard
EvidencePopover
DecisionReviewPanel
ActionItemEditor
RiskPanel
OpenQuestionPanel
TitleCandidateDialog
AutoSaveIndicator
WeeklyReportEditor
ChangeImpactMatrix
SearchFilters
SearchResultCard
ExportDialog
PermissionGuard
EmptyState
ErrorState
OfflineBanner
ConfirmDialog
AuditTimeline
```

---

# 21. MEETING REVIEW PAGE

## 21.1 Desktop

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 제목 / 상태 / 저장상태 / 참석자 / 승인 버튼                         │
├───────────────┬────────────────────────────┬────────────────────────┤
│ 안건 목록      │ 플레이어 + 전사             │ 결정/할 일/리스크 탭    │
│               │                            │                        │
│ 안건 1         │ 00:12:04 김민수            │ 결정 3                  │
│ 안건 2         │ 문장...                    │ 할 일 5                 │
│ 안건 3         │                            │ 미결 질문 2             │
└───────────────┴────────────────────────────┴────────────────────────┘
```

## 21.2 Mobile

```text
제목 / 상태
미니 플레이어
[요약] [원문] [결정] [할 일] [영향]
카드 목록
하단 고정: 저장 상태 / 검토 완료
```

## 21.3 상호작용

- 전사 문장을 클릭하면 해당 음성 구간 재생
- 결과 항목을 클릭하면 근거 문장을 강조
- 근거가 여러 개면 목록으로 표시
- 화자 이름 변경 시 관련 segment 일괄 갱신
- 안건 경계 drag 또는 시간 입력으로 수정
- 자동 저장 실패 시 재시도 버튼
- 승인 시 미검토 항목 존재 여부 경고

---

# 22. SECURITY, PRIVACY, AND AUDIT

## 22.1 보안

- TLS 전제
- 안전한 세션 쿠키
- CSRF 방어
- 비밀번호 해시
- 로그인 rate limit
- 업로드 rate limit
- signed URL 짧은 만료
- 조직 범위 권한 검사
- 파일명 정규화
- 콘텐츠 타입 검증
- 로그 민감정보 제거
- dependency audit 자동화
- 관리자 작업 감사 로그

## 22.2 녹음 동의

녹음 시작 전에:

```text
이 회의가 녹음되고 AI로 분석됩니다.
참석자에게 녹음 사실과 사용 목적을 고지했음을 확인합니다.
```

체크박스와 동의 시각을 기록한다.

## 22.3 보존과 삭제

- 조직별 보존 기간
- 음성 삭제
- 전사 삭제
- 전체 회의 삭제
- soft delete 후 정책에 따른 hard delete
- 삭제 작업 audit
- 삭제된 파일의 signed URL 발급 금지

## 22.4 민감정보

- 주민번호, 전화번호, 계정번호 후보 마스킹 옵션
- 사용자 확정 전 자동 마스킹은 원문을 훼손하지 않고 표시 계층에서 적용
- 외부 AI 전송 여부를 조직 설정으로 관리

---

# 23. OBSERVABILITY

- request ID
- structured log
- job ID
- meeting ID는 허용 범위에서 기록
- 사용자 원문 발언은 기본 로그 금지
- 작업 시간
- 실패율
- 큐 대기 시간
- 업로드 실패율
- AI schema validation failure
- 사용자 수정률
- 화자 매핑 수정률
- 결정 승인률
- 주간 보고서 생성 성공률

개발 환경에는 간단한 상태 페이지를 제공한다.

---

# 24. TEST STRATEGY

## 24.1 Unit

- 날짜·주차 계산
- 제목 템플릿
- 권한 함수
- 상태 전이
- AI 스키마
- 증거 연결 검증
- 중복 작업 방지
- 전사 표시 우선순위
- 주간 보고서 중복 제거
- 입력 검증

## 24.2 Integration

- 인증 세션
- 조직 격리
- 프로젝트 CRUD
- 회의 생성
- 업로드 완료
- 작업 큐 enqueue
- Mock Provider 처리
- 전사 저장
- 화자 매핑
- 안건 수정
- 항목 승인
- 주간 보고서 생성
- 검색
- 내보내기
- 삭제와 보존 정책

## 24.3 E2E

### 시나리오 1 — 모바일 녹음

```text
로그인
→ 프로젝트 선택
→ 새 회의
→ 녹음 동의
→ fixture 녹음 또는 테스트 오디오 업로드
→ 처리 완료
→ 제목 후보 확인
→ 화자 지정
→ 결정 승인
→ 회의록 승인
```

### 시나리오 2 — PC 검토

```text
회의 목록
→ 처리된 회의 열기
→ 3단 레이아웃 확인
→ 전사 클릭
→ 플레이어 이동
→ 할 일 담당자 지정
→ 기한 미정 유지 확인
→ 자동 저장
```

### 시나리오 3 — 주간 보고서

```text
주간 보고서 생성
→ 기간과 프로젝트 선택
→ 포함 회의 확인
→ 통합 보고서 생성
→ 출처 회의 링크 확인
→ 승인
→ Markdown/PDF 내보내기
```

### 시나리오 4 — 조직 격리

```text
조직 A 사용자로 조직 B의 meeting ID 직접 요청
→ 404 또는 권한 오류
→ 데이터 노출 없음
```

### 시나리오 5 — 네트워크 실패

```text
녹음 중 업로드 실패
→ 로컬 임시 저장 표시
→ 연결 복구
→ 청크 업로드 재개
→ 중복 청크 없음
```

## 24.4 Responsive

Playwright viewport:

```text
390 x 844
768 x 1024
1440 x 1000
```

각 viewport에서 overflow, 숨겨진 핵심 버튼, 접근 불가능한 dialog가 없어야 한다.

---

# 25. SEED AND DEMO DATA

## 25.1 기본 사용자

```text
admin@example.com / ChangeMe123!
editor@example.com / ChangeMe123!
viewer@example.com / ChangeMe123!
```

개발 환경 전용이며 첫 로그인 후 변경 안내를 표시한다.

## 25.2 데모 프로젝트

```text
조직: MeetingLoop Demo
프로젝트: 회원 시스템 개선
```

## 25.3 데모 회의

```text
제목: [회원 시스템] 탈퇴·재가입 제한 정책 개발 회의
유형: REQUIREMENTS
참석자:
- 김민수 / 백엔드
- 이지영 / 기획
- 박서준 / QA

안건:
1. 현재 재가입 정책
2. 30일 제한 기준
3. API와 DB 영향
4. 테스트 범위

결정:
- 탈퇴 후 30일 재가입 제한을 도입하기로 함

할 일:
- 백엔드 검증 로직 설계 / 김민수 / 기한 미정
- 경계값 테스트 작성 / 박서준 / 기한 미정

미결 질문:
- 30일을 시간 기준으로 계산할지 날짜 기준으로 계산할지
```

fixture transcript와 audio placeholder를 함께 제공한다.

---

# 26. IMPLEMENTATION BOARD

Codex는 검증을 통과한 항목만 체크한다.

## Phase 0 — Repository Bootstrap `[P0]`

- [x] pnpm workspace 구성
- [x] Next.js web 앱 생성
- [x] worker 앱 생성
- [x] 공유 package 구성
- [x] TypeScript strict mode
- [x] ESLint / formatter
- [x] Vitest
- [x] Playwright
- [ ] Docker Compose: PostgreSQL, Redis, MinIO
- [x] `.env.example`
- [x] health check
- [x] CI 품질 명령
- [x] README 실행 방법

### 완료 조건

```text
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

가 모두 성공한다.

---

## Phase 1 — Auth, Organization, Project `[P0]`

- [x] 사용자 모델
- [x] 회원가입
- [x] 로그인
- [x] 로그아웃
- [x] 세션
- [x] 조직 생성
- [x] 조직 멤버십
- [x] 역할 권한
- [x] 프로젝트 CRUD
- [x] 조직 격리 통합 테스트
- [x] 반응형 앱 셸
- [x] 모바일 하단 내비게이션
- [x] 데스크톱 사이드바

### 완료 조건

- 두 조직 간 직접 ID 접근으로 데이터가 노출되지 않는다.
- 모바일과 PC에서 로그인과 프로젝트 생성이 가능하다.

---

## Phase 2 — Meeting CRUD and Capture `[P0]`

- [x] 회의 생성
- [x] 회의 유형
- [x] 사전 안건
- [x] 참석자
- [x] 녹음 동의
- [x] 브라우저 녹음 UI
- [x] 일시 중지·재개·종료
- [x] 원본 음성 로컬 청크 보관
- [x] IndexedDB 임시 저장
- [x] fixture 파일 캡처 상태
- [x] 로컬 보관 진행률
- [x] 선택형 저장소 Adapter
- [x] 원본 음성 서버 업로드 비활성화 정책 고정
- [x] 로컬 원본 음성 삭제 UI
- [ ] 녹음 재생 로컬 URL
- [x] 모바일 E2E

### 완료 조건

- 모바일 viewport에서 녹음 또는 fixture 업로드가 가능하다.
- 네트워크 재시도 후 중복 없이 업로드가 완료된다.

---

## Phase 3 — Processing Queue and Mock AI `[P0]`

- [ ] ProcessingJob 모델
- [ ] Redis 큐
- [ ] worker
- [ ] idempotency
- [ ] 재시도
- [ ] 진행률 API
- [ ] FFmpeg 정규화 단계
- [ ] STT Adapter
- [ ] Diarization Adapter
- [ ] Analysis Adapter
- [ ] Mock Provider
- [ ] fixture 기반 전체 파이프라인
- [ ] 실패·재처리 UI

### 완료 조건

- AI 키 없이 업로드부터 `REVIEW` 상태까지 자동 진행된다.
- 동일 작업을 두 번 실행해도 전사와 항목이 중복 생성되지 않는다.

---

## Phase 4 — Transcript and Speaker Review `[P0]`

- [x] TranscriptSegment 저장
- [ ] 타임스탬프 전사 표시
- [ ] raw/normalized/edited 분리
- [ ] 오디오와 전사 동기화
- [ ] Speaker A/B/C 표시
- [ ] 화자 이름 일괄 지정
- [ ] 구간별 화자 수정
- [ ] 겹침 발언 표시
- [ ] 자동 저장
- [ ] 수정 이력 audit
- [ ] 모바일 탭 UI
- [ ] 데스크톱 중앙 전사 패널

### 완료 조건

- 원문은 수정되지 않는다.
- 사용자 수정은 확정 표시 텍스트에 반영된다.
- 전사 클릭 시 정확한 오디오 위치로 이동한다.

---

## Phase 5 — Agenda, Minutes, Decisions, Actions `[P0]`

- [ ] 안건 자동 생성
- [ ] 안건 수동 추가·수정·삭제
- [ ] 안건 시간 경계 수정
- [x] 전체 요약
- [ ] 안건별 요약
- [x] 결정 추출
- [ ] 제안 추출
- [x] 할 일 추출
- [x] 리스크 추출
- [x] 미결 질문 추출
- [ ] 근거 연결
- [ ] 승인·반려·편집
- [ ] 담당자 지정
- [ ] 기한 미정 처리
- [ ] 회의록 편집
- [ ] 회의록 승인
- [ ] 3단 데스크톱 화면

### 완료 조건

- 모든 AI 항목이 적어도 하나의 근거 segment를 가진다.
- 제안이 자동으로 확정 결정이 되지 않는다.
- 기한이 원문에 없으면 null이다.

---

## Phase 6 — Automatic Title and Templates `[P0]`

- [ ] 제목 후보 3개 생성
- [ ] 후보 confidence
- [ ] 생성 이유
- [ ] 임시 제목 자동 선택
- [ ] 사용자 확정
- [ ] 직접 수정
- [ ] 제목 변경 이력
- [ ] 조직 제목 템플릿
- [ ] 반복 회의 제목 규칙
- [ ] 회의 유형 자동 후보

### 완료 조건

- 처리 완료 후 임시 제목이 자동 생성된다.
- 사용자는 모바일과 PC 모두에서 제목을 확정할 수 있다.

---

## Phase 7 — Weekly Minutes and Reports `[P0]`

- [ ] 단일 주간회의 템플릿
- [ ] 주간 기간 계산
- [ ] 여러 회의 선택
- [ ] 프로젝트별 통합 보고서
- [ ] 팀별 통합 보고서 구조
- [ ] 결정 중복 제거
- [ ] 작업 최신 상태 병합
- [ ] 충돌 표시
- [ ] 출처 회의 연결
- [ ] 보고서 편집
- [ ] 승인
- [ ] 자동 제목
- [ ] 모바일 보고서 화면

### 완료 조건

- 서울 시간대 기준 월요일~일요일 범위를 정확히 계산한다.
- 보고서 모든 핵심 항목에서 원본 회의로 이동할 수 있다.

---

## Phase 8 — Project Documents and Impact Analysis `[P1]`

- [ ] 문서 업로드
- [ ] 텍스트 추출 Adapter
- [ ] 문서 버전
- [ ] chunking
- [ ] keyword 검색
- [ ] vector Adapter
- [ ] pgvector 가능 시 의미 검색
- [ ] 결정과 관련 문서 검색
- [ ] current/target state
- [ ] 레이어별 영향
- [ ] 테스트 제안
- [ ] 리스크
- [ ] 미결 질문
- [ ] 이전 결정 충돌
- [ ] 영향 분석 검토 화면

### 완료 조건

- 문서가 없으면 추정임을 표시한다.
- 존재하지 않는 파일명·API명을 확정적으로 생성하지 않는다.
- 영향 항목은 근거 결정과 관련 문서를 연결한다.

---

## Phase 9 — Search, Record Management, Export `[P0/P1]`

- [ ] 회의 목록 필터
- [ ] 키워드 검색 `[P0]`
- [ ] 참석자 검색 `[P0]`
- [ ] 날짜·상태 필터 `[P0]`
- [ ] 전사 위치 이동 `[P0]`
- [ ] 의미 검색 `[P1]`
- [ ] 자연어 검색 `[P1]`
- [ ] Markdown export `[P0]`
- [ ] JSON export `[P0]`
- [ ] PDF export `[P0]`
- [ ] 프로젝트별 보관
- [ ] 아카이브
- [ ] 보존 정책
- [ ] 삭제 흐름

### 완료 조건

- 검색 결과는 권한 범위 밖의 데이터를 포함하지 않는다.
- PDF에는 제목, 요약, 안건, 결정, 할 일, 근거 시간 정보가 포함된다.

---

## Phase 10 — Notifications, Audit, Admin `[P1]`

- [ ] 알림 센터
- [ ] 내 할 일
- [ ] 검토 요청
- [ ] 승인 알림
- [ ] 처리 실패 알림
- [ ] AuditLog 화면
- [ ] 멤버 관리
- [ ] 보존 기간 설정
- [ ] 외부 AI 사용 설정
- [ ] 음성 프로필 비활성 기본값
- [ ] 조직 설정

### 완료 조건

- 관리자 변경과 승인 작업이 audit에 남는다.
- 일반 사용자가 관리자 화면을 호출할 수 없다.

---

## Phase 11 — PWA, Offline, Accessibility `[P1]`

- [ ] manifest
- [ ] 설치 가능
- [ ] 서비스 워커
- [ ] 오프라인 배너
- [ ] 녹음 청크 임시 보관
- [ ] 재연결 동기화
- [ ] 키보드 탐색
- [ ] screen reader label
- [ ] focus management
- [ ] 명암 대비
- [ ] reduced motion
- [ ] 390/768/1440 viewport 검증

### 완료 조건

- 핵심 작업 버튼이 모든 viewport에서 접근 가능하다.
- dialog와 sheet가 키보드로 열고 닫힌다.
- 업로드 실패 데이터가 사라지지 않는다.

---

## Phase 12 — Production Readiness `[P0/P1]`

- [ ] seed
- [ ] demo fixture
- [ ] 전체 E2E
- [ ] 보안 점검
- [ ] rate limit
- [ ] sanitized logging
- [ ] graceful shutdown
- [ ] backup 문서
- [ ] DB migration rollback 전략
- [ ] health/readiness
- [ ] CI
- [ ] production Dockerfile
- [ ] 배포 문서
- [ ] 최종 build
- [ ] 최종 회귀 테스트

### 완료 조건

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

모두 성공하고, 데모 시나리오 3개가 실제 UI에서 완료된다.

---

# 27. DEFINITION OF DONE

작업 하나를 완료 처리하려면 다음을 모두 만족해야 한다.

- 요구사항이 코드로 구현됨
- 관련 DB 마이그레이션 존재
- API 입력 검증 존재
- 서버 권한 검사 존재
- 로딩 상태 존재
- 빈 상태 존재
- 오류 상태 존재
- 모바일 레이아웃 정상
- 데스크톱 레이아웃 정상
- 단위 또는 통합 테스트 존재
- 중요 사용자 흐름은 E2E 존재
- lint 통과
- typecheck 통과
- 관련 테스트 통과
- build 통과
- audit가 필요한 변경은 audit 기록
- 이 문서의 체크박스와 ledger 갱신

---

# 28. RELEASE ACCEPTANCE SCENARIOS

## Scenario A — 모바일에서 회의 생성

1. 사용자 로그인
2. 프로젝트 선택
3. 새 회의 생성
4. 참석자 입력
5. 녹음 동의
6. 녹음 또는 오디오 업로드
7. 업로드 중 네트워크 끊김
8. 연결 복구
9. 업로드 재개
10. 처리 상태 확인
11. 자동 제목 확인
12. 화자 이름 지정
13. 결정과 할 일 확인
14. 회의록 승인

**기대 결과:** 데이터 손실 없이 완료되고 모든 AI 항목에 근거가 있다.

## Scenario B — PC에서 상세 검토

1. 회의 검토 화면 진입
2. 3단 레이아웃
3. 안건 클릭
4. 전사 위치 이동
5. 전사 문장 클릭
6. 음성 해당 구간 재생
7. 제안을 결정으로 잘못 분류한 항목 반려
8. 할 일 담당자 지정
9. 기한 미정 유지
10. 자동 저장 확인

**기대 결과:** 원문은 보존되고 사용자 수정본만 변경된다.

## Scenario C — 주간 보고서

1. 프로젝트 선택
2. 주간 범위 선택
3. 포함 회의 확인
4. 보고서 생성
5. 중복 결정 병합 확인
6. 충돌 항목 확인
7. 출처 회의 이동
8. 보고서 승인
9. PDF/Markdown 다운로드

**기대 결과:** 모든 핵심 내용이 출처 회의로 추적된다.

## Scenario D — 개발 영향 분석

1. 프로젝트 문서 업로드
2. 승인된 결정 선택
3. 영향 분석
4. UI/API/DB/테스트 영향 확인
5. 리스크와 미결 질문 확인
6. 사용자 편집
7. 승인

**기대 결과:** 존재하지 않는 대상을 확정적으로 생성하지 않으며 추정은 표시된다.

## Scenario E — 권한

1. 조직 A 사용자 로그인
2. 조직 B meeting ID 직접 요청
3. API와 UI 확인

**기대 결과:** 어떠한 메타데이터나 내용도 노출되지 않는다.

---

# 29. QUALITY GATES

## Gate 1 — Foundation

- 앱 실행
- DB 연결
- 로그인
- 프로젝트 생성
- lint/typecheck/build

## Gate 2 — Vertical MVP

- 회의 생성
- 업로드
- Mock AI 처리
- 검토 화면
- 결정 승인

## Gate 3 — Responsive

- 모바일 녹음
- 태블릿 검토
- 데스크톱 3단 화면

## Gate 4 — Weekly

- 여러 회의 통합
- 출처 추적
- 승인과 export

## Gate 5 — Security

- 조직 격리
- 권한 검사
- signed URL
- audit
- 민감 로그 제거

## Gate 6 — Release

- 모든 P0 체크
- 필수 P1 중 운영에 필요한 항목 체크
- 전체 테스트
- production build
- demo seed
- 실행 문서

---

# 30. ERROR HANDLING MATRIX

| 오류 | 사용자 메시지 | 시스템 동작 |
|---|---|---|
| 마이크 권한 거부 | 마이크 사용 권한이 필요합니다. | 권한 안내와 파일 업로드 대안 |
| 네트워크 단절 | 오프라인 임시 저장 중입니다. | IndexedDB 저장 |
| 업로드 일부 실패 | 업로드를 다시 시도합니다. | 누락 청크만 재시도 |
| 지원하지 않는 형식 | 지원하지 않는 음성 형식입니다. | 업로드 중단 |
| STT 실패 | 음성 인식에 실패했습니다. | 재시도 버튼 |
| AI 스키마 오류 | 분석 결과를 생성하지 못했습니다. | 한 번 재요청 후 실패 |
| 근거 누락 | 근거 확인이 필요한 항목입니다. | NEEDS_REVIEW |
| 권한 없음 | 접근할 수 없습니다. | 데이터 미노출 |
| 삭제된 파일 | 재생할 수 없는 음성입니다. | signed URL 미발급 |
| 저장 충돌 | 다른 변경이 감지되었습니다. | 최신본 비교 후 병합 UI |

---

# 31. CODING CONVENTIONS

- TypeScript `strict: true`
- `any` 사용 금지, 불가피하면 주석과 좁은 범위
- 도메인 상태는 문자열 리터럴 union 또는 enum
- 서버 mutation은 입력 스키마 검증
- DB transaction이 필요한 복합 변경은 transaction 사용
- 시간은 DB에서 UTC
- 사용자 표시 시 timezone 변환
- 금액·날짜·파일 크기 포맷 함수 중앙화
- UI 문자열은 추후 i18n 가능한 구조
- 컴포넌트는 데이터 로직과 표현을 분리
- API 오류 code 중앙화
- 테스트 fixture 중앙화
- 비동기 작업은 idempotent
- 중요 상태 전이는 도메인 서비스에서만 수행
- 원본 데이터와 파생 데이터를 명확히 구분

---

# 32. PERFORMANCE BUDGET

초기 기준:

- 대시보드 핵심 콘텐츠 빠른 표시
- 긴 전사는 가상화 목록 사용
- 오디오 전체를 메모리에 한 번에 올리지 않음
- 검색 결과 pagination
- signed playback URL
- 보고서 생성은 비동기 작업
- 대용량 파일 multipart upload
- DB 인덱스:
  - organizationId
  - projectId
  - meetingId
  - status
  - startedAt
  - transcript sequence
  - extracted item type/status
  - weekly report weekStart/weekEnd
- N+1 쿼리 방지
- 모바일에서 불필요한 대용량 데이터를 내려받지 않음

---

# 33. PROGRESS LEDGER

Codex는 매 루프 종료 후 아래 형식을 복사하여 최신 항목을 맨 위에 추가한다.

```text
## YYYY-MM-DD HH:mm — Loop N

선택 작업:
- Phase X / 항목명

구현:
- 파일 또는 모듈
- 사용자 흐름

검증:
- pnpm lint: PASS/FAIL
- pnpm typecheck: PASS/FAIL
- pnpm test: PASS/FAIL
- pnpm test:integration: PASS/FAIL
- pnpm test:e2e: PASS/FAIL 또는 NOT_APPLICABLE
- pnpm build: PASS/FAIL

수정한 문제:
- 문제와 해결

남은 위험:
- 위험 또는 없음

다음 추천 작업:
- 다음 항목
```

현재 Ledger:

```text
## 2026-07-14 14:50 — Loop 14

선택 작업:
- Phase 5 / 전사 TXT 기반 AI 분석 보고서 확장

구현:
- packages/domain/src/index.ts: MeetingMinutes에 discussionTopics, risks, openQuestions 필드 추가
- packages/ai/src/index.ts: MockMinutesProvider가 요약, 주요 논의, 결정, 할 일, 리스크, 미결 질문을 생성하도록 확장
- packages/db/src/index.ts: 전사 TXT 기반 회의록 저장 흐름에 분석 보고서 필드 저장 추가
- packages/db/migrations/0001_phase1_auth_project.sql: meeting_minutes 테이블에 discussion_topics, risks, open_questions JSONB 컬럼 추가
- apps/web/app/RecordingPanel.tsx: AI 회의록 초안 영역을 AI 분석 보고서로 변경하고 주요 논의, 리스크, 미결 질문 표시 추가
- apps/web/app/page.tsx: 기본 화면 안내 문구를 AI 분석 보고서 흐름에 맞게 수정
- tests/e2e/home.spec.ts, packages/db/src/index.test.ts: AI 분석 보고서 생성과 새 분석 필드 검증 추가

검증:
- pnpm lint 통과
- pnpm typecheck 통과
- pnpm test 통과
- pnpm test:integration 통과
- pnpm test:e2e 통과
- pnpm build 통과
- pnpm db:migrate 통과
- pnpm db:seed 통과

남은 위험:
- 실제 LLM provider 연결은 아직 미구현이며 현재는 Mock Provider 기반 분석 보고서
- 근거 클릭으로 음성 위치 이동, 보고서 편집·승인·반려 플로우는 아직 미구현
- 실제 PostgreSQL 저장은 docker CLI 부재 환경에서는 계속 제한될 수 있음

다음 추천 작업:
- Phase 5 / 회의록 편집·승인 UX 또는 근거 연결

## 2026-07-14 14:04 — Loop 13

선택 작업:
- 기본 화면 단순화 / 녹음·전사·회의록 중심의 2열 작업 화면

구현:
- apps/web/app/page.tsx: 기존 3열 대시보드형 화면을 녹음·전사 중심 primary 영역과 회의 준비 사이드 영역으로 단순화
- apps/web/app/page.tsx: 데모 분석 카드와 긴 전사 데모 목록을 기본 화면에서 제거
- apps/web/app/page.tsx: 프로젝트 생성, 프로젝트 관리, 새 조직 만들기를 details 접이식 영역으로 이동
- apps/web/app/globals.css: simple-layout, current-meeting, mini-list, compact-details 스타일 추가
- tests/e2e/home.spec.ts: 단순화된 화면에서 로그인, 프로젝트 생성, 회의 생성, 전사 저장, AI 회의록 생성, 프로젝트 수정·보관 플로우 재검증

검증:
- pnpm lint 통과
- pnpm typecheck 통과
- pnpm test 통과
- pnpm test:integration 통과
- pnpm test:e2e 통과
- pnpm build 통과
- pnpm db:migrate 통과
- pnpm db:seed 통과

남은 위험:
- 회의 준비 패널의 상세 입력은 여전히 데모 fixture 기반이며 실제 캘린더/참석자 자동화는 미구현
- 프로젝트 관리 기능은 접이식 영역에 남겨두었지만, 별도 설정 화면으로 분리하는 작업은 아직 미구현
- 화면 단순화에 대한 실제 사용자 사용성 평가는 아직 미수행

다음 추천 작업:
- Phase 5 / 회의록 편집·승인 UX 또는 Phase 2 / 녹음 재생 로컬 URL

## 2026-07-14 13:55 — Loop 12

선택 작업:
- Phase 2 후속 / 로컬 원본 음성 삭제 UI

구현:
- apps/web/app/RecordingPanel.tsx: IndexedDB chunks object store를 비우는 deleteLocalChunks 추가
- apps/web/app/RecordingPanel.tsx: 녹음 중이 아닐 때 사용할 수 있는 로컬 원본 음성 삭제 버튼 추가
- apps/web/app/RecordingPanel.tsx: 삭제 후 임시 청크, bytes, 로컬 확인 상태를 0으로 초기화하고 서버 전사 TXT/AI 회의록은 유지된다는 안내 표시
- tests/e2e/home.spec.ts: 모바일/태블릿/데스크톱에서 로컬 원본 음성 삭제 버튼과 삭제 안내 문구 검증
- CODEX_MASTER_BUILD_LOOP.md: Phase 2에 로컬 원본 음성 삭제 UI 완료 항목 추가

검증:
- pnpm lint 통과
- pnpm typecheck 통과
- pnpm test 통과
- pnpm test:integration 통과
- pnpm test:e2e 통과
- pnpm build 통과
- pnpm db:migrate 통과
- pnpm db:seed 통과

남은 위험:
- 삭제 전 확인 모달과 삭제 이력 audit은 아직 미구현
- 브라우저별 저장소 용량/권한 경고는 아직 세부 처리하지 않음
- 로컬 음성 재생 URL은 아직 미구현

다음 추천 작업:
- Phase 5 / 회의록 편집·승인 UX 또는 Phase 2 / 녹음 재생 로컬 URL

## 2026-07-14 13:44 — Loop 11

선택 작업:
- Phase 5 / 전사 TXT 기반 AI 회의록 생성과 서버 저장

구현:
- packages/domain/src/index.ts: MeetingMinutes, MinutesActionItem, generateMinutesInput 스키마 추가
- packages/ai/src/index.ts: 저장된 전사 TXT만 입력받는 MockMinutesProvider 추가
- packages/db/src/index.ts: generateDemoMinutesFromTranscript와 meeting minutes in-memory 저장소 추가
- packages/db/migrations/0001_phase1_auth_project.sql: meeting_minutes 테이블과 unique meeting_id 제약 추가
- apps/web/app/api/minutes/generate/route.ts: 전사 TXT 기반 AI 회의록 생성 API 추가
- apps/web/app/RecordingPanel.tsx: AI 회의록 생성 버튼과 초안 표시 영역 추가
- apps/web/app/page.tsx: 회의 상태에 회의록 DRAFT 여부 표시
- tests/e2e/home.spec.ts: 전사 저장 후 AI 회의록 생성과 화면 표시 검증
- packages/db/src/index.test.ts: 저장된 전사 TXT가 있어야 회의록이 생성되고 원본 음성 없이 summary가 만들어지는 흐름 검증

검증:
- pnpm lint 통과
- pnpm typecheck 통과
- pnpm test 통과
- pnpm test:integration 통과
- pnpm test:e2e 통과
- pnpm build 통과
- pnpm db:migrate 통과
- pnpm db:seed 통과

남은 위험:
- AI 회의록은 현재 Mock Provider 기반이며 실제 LLM provider 연결은 아직 미구현
- 회의록 편집, 승인, 반려, 항목별 근거 클릭 이동은 아직 미구현
- 실제 PostgreSQL 저장은 docker CLI 부재로 미검증이며 현재는 demo in-memory 저장소 기반

다음 추천 작업:
- Phase 5 / 회의록 편집·승인 UX 또는 로컬 원본 음성 삭제 UI

## 2026-07-14 13:25 — Loop 10

선택 작업:
- 제품 저장 정책 변경 / 원본 음성 로컬 보관, 서버에는 전사 TXT와 AI 회의록만 저장

구현:
- apps/web/app/RecordingPanel.tsx: 원본 음성 청크를 서버로 POST하지 않고 IndexedDB 로컬 보관 확인만 수행하도록 변경
- apps/web/app/RecordingPanel.tsx: 사용자 화면의 업로드 표현을 로컬 보관 확인 표현으로 변경
- apps/web/app/api/recordings/chunks/route.ts: ALLOW_RAW_AUDIO_SERVER_UPLOAD=true가 아닌 경우 원본 음성 서버 업로드를 403으로 차단
- .env.example: ALLOW_RAW_AUDIO_SERVER_UPLOAD=false 기본값 추가
- tests/e2e/home.spec.ts: 로컬 음성 보관 확인 버튼 기준으로 회귀 테스트 갱신
- CODEX_MASTER_BUILD_LOOP.md: P0 scope와 Phase 2 체크리스트를 원본 음성 로컬 보관, 전사 TXT 서버 저장 정책으로 수정

검증:
- pnpm lint 통과
- pnpm typecheck 통과
- pnpm test 통과
- pnpm test:integration 통과
- pnpm test:e2e 통과
- pnpm build 통과
- pnpm db:migrate 통과
- pnpm db:seed 통과

남은 위험:
- 로컬 IndexedDB에 보관된 원본 음성의 사용자가 직접 삭제하는 UI는 아직 미구현
- 서버에는 전사 segment가 저장되지만 AI 회의록/요약 결과 저장 테이블은 아직 미구현
- 선택형 원본 음성 서버 업로드 API는 환경변수로 막았지만, 이후 운영 배포에서는 라우트 권한/배포 설정으로 한 번 더 잠글 필요가 있음

다음 추천 작업:
- Phase 4/5 / 전사 TXT 기반 AI 회의록 생성과 서버 저장, 로컬 원본 음성 삭제 UI

## 2026-07-14 13:19 — Loop 9

선택 작업:
- Phase 4 / TranscriptSegment 저장, edited text 영구 저장 시작

구현:
- packages/domain/src/index.ts: TranscriptSegment, transcriptSegmentInput, saveTranscriptSegmentsInput 스키마 추가
- packages/db/src/index.ts: demo transcriptSegments 저장소, saveDemoTranscriptSegments, getDemoTranscriptSegments 추가
- packages/db/migrations/0001_phase1_auth_project.sql: transcript_segments 테이블과 meeting sequence index 추가
- apps/web/app/api/transcripts/segments/route.ts: 세션 조직 범위의 전사 segment 저장/조회 API 추가
- apps/web/app/RecordingPanel.tsx: 전사 저장 버튼을 API에 연결하고 rawText/editedText 분리 전송
- apps/web/app/page.tsx: 최신 회의 ID를 녹음 패널에 전달하고 회의 상태에 전사 segment 수 표시
- tests/e2e/home.spec.ts: 회의 생성 후 전사 문장을 서버에 저장하는 모바일/태블릿/데스크톱 플로우 검증
- packages/db/src/index.test.ts: 같은 client segment 재저장 시 중복 없이 editedText가 갱신되는지 검증

검증:
- pnpm lint 통과
- pnpm typecheck 통과
- pnpm test 통과
- pnpm test:integration 통과
- pnpm test:e2e 통과
- pnpm build 통과
- pnpm db:migrate 통과
- pnpm db:seed 통과

남은 위험:
- 현재 저장소는 데모 in-memory DB이며 실제 PostgreSQL 적용은 docker CLI 부재로 미검증
- Web Speech live draft의 rawText와 editedText는 분리되지만 normalizedText 필드는 아직 별도 저장하지 않음
- 삭제 이력 audit, segment별 수정 이력, 오디오 위치 클릭 동기화는 아직 미구현

다음 추천 작업:
- Phase 4 / raw-normalized-edited 완전 분리, 수정 이력 audit, 전사 segment 삭제 저장

## 2026-07-14 12:41 — Loop 8

선택 작업:
- Phase 4 선행 UX / 실시간 전사 초안 표시, 수정, 삭제, 저장 흐름

구현:
- apps/web/app/RecordingPanel.tsx: Web Speech API 기반 실시간 전사 초안 수신 구조 추가
- apps/web/app/RecordingPanel.tsx: 전사 문장 textarea 편집, 문장 추가, 문장 삭제, 전사 저장 상태 표시 추가
- apps/web/app/RecordingPanel.tsx: 브라우저가 실시간 음성 인식을 지원하지 않을 때 수동 문장 추가 안내 표시
- apps/web/app/page.tsx: 깨진 한글 UI 문구를 정상 한국어로 정리
- apps/web/app/globals.css: 실시간 전사 편집 패널, segment meta, 모바일 반응형 스타일 추가
- tests/e2e/home.spec.ts: 모바일/태블릿/데스크톱에서 전사 문장 추가, 수정, 저장, 삭제 플로우 검증

검증:
- pnpm lint 통과
- pnpm typecheck 통과
- pnpm test 통과
- pnpm test:integration 통과
- pnpm test:e2e 통과
- pnpm build 통과
- pnpm db:migrate 통과
- pnpm db:seed 통과

남은 위험:
- 현재 전사 저장은 브라우저 상태 기반 UX이며 DB 영구 저장, 수정 이력 audit, 회의별 segment 저장은 아직 미구현
- Web Speech API 지원 브라우저에서만 녹음 중 실시간 부분 전사가 동작하며, 미지원 환경은 수동 문장 추가 또는 후처리 STT가 필요
- 저장된 전사 초안을 요약, 결정, 할 일 추출 파이프라인에 연결하는 작업은 아직 미구현

다음 추천 작업:
- Phase 4 / TranscriptSegment 저장, edited text 영구 저장, 수정 이력 audit

## 2026-07-14 12:24 — Loop 7

선택 작업:
- Phase 2 / MinIO 저장소 구현, 실제 청크 바이너리 업로드, 녹음 재생 signed URL

구현:
- packages/storage/src/index.ts: S3CompatibleStorageAdapter 추가, AWS Signature V4 PUT 업로드와 signed GET URL 생성 구현
- packages/storage/src/index.ts: RecordingChunkStorageAdapter 공통 인터페이스와 createStorageAdapterFromEnv 추가
- apps/web/app/api/recordings/chunks/route.ts: IndexedDB 청크 bodyBase64를 받아 실제 bytes를 storage adapter로 전달
- apps/web/app/api/recordings/playback-url/route.ts: 조직 세션 범위의 녹음 파일 signed URL 발급 API 추가
- apps/web/app/RecordingPanel.tsx: IndexedDB Blob을 base64로 변환해 청크 업로드 API에 전송
- packages/storage/src/index.test.ts: S3-compatible signed URL, 환경 기반 adapter 선택, signed PUT 업로드 호출 검증
- .env.example: STORAGE_DRIVER=memory 기본값 추가, s3 전환 경로 명시

검증:
- pnpm lint 통과
- pnpm typecheck 통과
- pnpm test 통과
- pnpm test:integration 통과
- pnpm test:e2e 통과
- pnpm build 통과
- pnpm db:migrate 통과
- pnpm db:seed 통과

남은 위험:
- docker CLI 부재로 실제 MinIO 컨테이너에 대한 라이브 PUT/GET 검증은 아직 미완료
- 녹음 청크 병합, 완성 녹음 파일 생성, signed URL을 재생 UI에 연결하는 작업은 아직 미구현
- 대용량 청크의 base64 JSON 전송은 MVP 경로이며, 이후 multipart/form-data 또는 presigned direct upload로 개선 필요

다음 추천 작업:
- Phase 3 / STT job queue 시작 또는 Phase 2 후속 / 청크 병합과 재생 UI 연결

## 2026-07-14 12:15 — Loop 6

선택 작업:
- Phase 2 / 청크 업로드 모델, 재시도 큐, 업로드 진행률, 저장소 Adapter 연결

구현:
- packages/storage/src/index.ts: 녹음 청크 저장 key 생성기와 MemoryChunkStorageAdapter 추가
- packages/storage/src/index.test.ts: 청크 key와 메모리 Adapter 업로드 metadata 검증
- apps/web/app/api/recordings/chunks/route.ts: 세션 기반 청크 업로드 API 추가
- apps/web/app/RecordingPanel.tsx: IndexedDB 대기 청크 조회, 업로드 완료 표시, 재시도 버튼, 진행률 meter 추가
- tests/e2e/home.spec.ts: 모바일/태블릿/데스크톱에서 업로드 버튼과 초기 진행률 표시 검증
- apps/web/tsconfig.json: web 앱에서 storage 패키지 project reference 추가

검증:
- pnpm lint 통과
- pnpm typecheck 통과
- pnpm test 통과
- pnpm test:integration 통과
- pnpm test:e2e 통과
- pnpm build 통과
- pnpm db:migrate 통과
- pnpm db:seed 통과

남은 위험:
- 청크 API는 현재 JSON metadata 기반의 메모리 저장소 Adapter에 연결되어 있으며 실제 바이너리 multipart 업로드는 아직 미구현
- MinIO/S3 실제 저장, signed URL 재생, 네트워크 실패 자동 재시도 시뮬레이션은 아직 미구현
- docker CLI 부재로 로컬 PostgreSQL/Redis/MinIO compose 환경 검증은 아직 미완료

다음 추천 작업:
- Phase 2 / MinIO 저장소 구현, 실제 청크 바이너리 업로드, 녹음 재생 signed URL

## 2026-07-14 10:16 — Loop 5

선택 작업:
- Phase 2 / 브라우저 녹음 UI 상태 머신과 IndexedDB 임시 저장

구현:
- apps/web/app/RecordingPanel.tsx: MediaRecorder 기반 녹음 시작, 일시 중지, 재개, 종료
- apps/web/app/RecordingPanel.tsx: dataavailable 청크를 IndexedDB meetingloop-recordings/chunks에 임시 저장
- apps/web/app/page.tsx: 전사 검토 패널에 브라우저 녹음 컨트롤 삽입
- apps/web/app/globals.css: 입력 레벨 미터, 청크/bytes 상태, 모바일 대응 스타일
- tests/e2e/home.spec.ts: 390/768/1440 viewport에서 녹음 패널 초기 상태와 비활성 제어 버튼 검증

검증:
- pnpm lint: PASS
- pnpm typecheck: PASS
- pnpm test: PASS
- pnpm test:integration: PASS
- pnpm test:e2e: PASS
- pnpm db:migrate: PASS
- pnpm db:seed: PASS
- pnpm build: PASS

수정한 문제:
- MediaRecorderOptions에 mimeType undefined를 넘기지 않도록 조건부 옵션 객체로 수정
- 기존 dev server가 3000 포트를 점유해 E2E가 이전 화면을 재사용하던 문제를 서버 정리 후 재검증
- E2E에서 브라우저 녹음과 브라우저 녹음 제어 aria-label이 부분 매칭되던 문제를 region role 기반 선택자로 수정

남은 위험:
- E2E 환경에서는 실제 마이크 권한/녹음 시작까지 자동 검증하지 않고 초기 UI와 상태 제어 접근성만 검증
- 청크는 IndexedDB에 저장되지만 아직 서버 multipart upload, 누락 청크 재시도, MinIO 저장소와 연결되지 않음
- 녹음 결과를 회의 Recording 모델에 자동 연결하는 흐름은 아직 미구현

다음 추천 작업:
- Phase 2 / 청크 업로드 모델, 재시도 큐, 업로드 진행률, 저장소 Adapter 연결

## 2026-07-14 10:06 — Loop 4

선택 작업:
- Phase 2 / Meeting CRUD and Capture 시작

구현:
- packages/domain: MeetingType, Participant, Agenda, Recording, createMeetingInputSchema, 회의 생성 권한 guard
- packages/db: createDemoMeeting, DemoMeetingBundle, workspace 회의 요약 목록
- packages/db/migrations/0001_phase1_auth_project.sql: meetings, participants, agendas, recordings schema 초안 추가
- apps/web: 새 회의 폼, 프로젝트 선택, 회의 유형, 참석자, 사전 안건, 녹음 동의, fixture 파일명 업로드 상태 표시
- tests/e2e: 390/768/1440 viewport에서 로그인, 프로젝트 생성, 회의 생성, fixture 업로드 COMPLETED 상태 검증

검증:
- pnpm lint: PASS
- pnpm typecheck: PASS
- pnpm test: PASS
- pnpm test:integration: PASS
- pnpm test:e2e: PASS
- pnpm db:migrate: PASS
- pnpm db:seed: PASS
- pnpm build: PASS

수정한 문제:
- E2E에서 프로젝트 select option과 프로젝트 카드 텍스트가 중복되어 locator를 카드 범위로 좁힘
- 녹음 동의 문구에 참석자가 포함되어 참석자 textarea locator가 모호하던 문제를 role 기반 선택자로 수정
- 여러 viewport 테스트가 같은 dev server 메모리를 공유해 COMPLETED 텍스트가 중복되던 문제를 현재 회의 카드 범위로 수정

남은 위험:
- 실제 브라우저 MediaRecorder 녹음, 일시 중지/재개/종료는 아직 미구현
- 청크 업로드, IndexedDB 임시 저장, 네트워크 재시도, MinIO 저장소, signed URL은 아직 미구현
- 파일 업로드는 실제 파일 바이너리가 아니라 fixture 파일명 기반 데모 업로드 상태로 구현됨
- docker CLI 부재로 PostgreSQL migration 실제 적용은 미검증

다음 추천 작업:
- Phase 2 / 브라우저 녹음 UI 상태 머신, 일시 중지·재개·종료, 청크 업로드/재시도 모델

## 2026-07-14 09:44 — Loop 3

선택 작업:
- Phase 1 / 회원가입, 조직 생성, 프로젝트 수정·보관, DB schema 초안

구현:
- packages/domain: 회원가입/조직 생성, 프로젝트 수정, 프로젝트 보관 입력 스키마
- packages/db: registerDemoOrganization, updateDemoProject, archiveDemoProject
- packages/db/migrations/0001_phase1_auth_project.sql: organizations, users, memberships, projects schema 초안
- apps/web: 새 조직 만들기 폼, 프로젝트 수정 폼, 프로젝트 보관 action
- tests/e2e: 390/768/1440 viewport에서 회원가입, 조직 생성, 프로젝트 생성, 수정, 보관 검증

검증:
- pnpm lint: PASS
- pnpm typecheck: PASS
- pnpm test: PASS
- pnpm test:integration: PASS
- pnpm test:e2e: PASS
- pnpm build: PASS

수정한 문제:
- 프로젝트 생성 E2E에서 수정 폼의 설명 입력과 생성 폼의 설명 입력이 같은 label로 잡히던 locator 모호성을 placeholder 기반 선택으로 수정

남은 위험:
- PostgreSQL 실제 migration 적용은 docker CLI 부재로 미검증
- DB layer는 아직 deterministic demo in-memory repository이며 서버 재시작 시 새로 초기화됨
- 프로젝트 삭제는 보관 처리로 구현했고 영구 삭제/보존 정책은 Phase 9/12에서 별도 구현 필요

다음 추천 작업:
- Phase 2 / 회의 생성, 회의 유형, 참석자, 녹음 동의, fixture 업로드 시작

## 2026-07-14 09:20 — Loop 2

선택 작업:
- Phase 1 / Auth, Organization, Project 수직 흐름 일부

구현:
- packages/domain: User, Organization, Membership, Project 생성 입력, 역할 권한 guard
- packages/auth: Argon2 비밀번호 검증, HMAC 서명 쿠키 세션, 프로젝트 관리 권한 판단
- packages/db: 결정적 데모 사용자/조직/멤버십/프로젝트 저장소, 인증, 조직 범위 프로젝트 조회/생성
- apps/web: 로그인, 로그아웃, 세션 기반 작업 공간, 프로젝트 목록, 관리자 프로젝트 생성 폼
- tests/e2e: 390/768/1440 viewport에서 로그인 후 프로젝트 생성 검증
- tests/integration: 조직 간 직접 프로젝트 접근 차단 검증

검증:
- pnpm install --no-frozen-lockfile: PASS
- pnpm lint: PASS
- pnpm typecheck: PASS
- pnpm test: PASS
- pnpm test:integration: PASS
- pnpm test:e2e: PASS
- pnpm db:migrate: PASS
- pnpm db:seed: PASS
- pnpm build: PASS

수정한 문제:
- E2E와 production build를 병렬 실행하면 apps/web/.next가 충돌하므로 순차 검증으로 조정
- Playwright가 로그인 이후 서버 action redirect와 프로젝트 생성까지 검증하도록 보강

남은 위험:
- 회원가입, 조직 생성, 프로젝트 수정/삭제는 아직 미구현이므로 Phase 1의 해당 체크박스는 미체크 유지
- db:migrate와 db:seed는 아직 placeholder이며 실제 PostgreSQL schema/seed로 교체 필요
- 현재 환경에 docker CLI가 없어 PostgreSQL, Redis, MinIO 컨테이너 기동은 계속 미검증

다음 추천 작업:
- Phase 1 / 회원가입, 조직 생성, 프로젝트 수정·보관, 실제 DB schema 초안

## 2026-07-14 09:07 — Loop 1

선택 작업:
- Phase 0 / Repository Bootstrap

구현:
- 루트 pnpm workspace, TypeScript strict 설정, ESLint, Vitest, Playwright 구성
- apps/web Next.js App Router, /api/health, 반응형 회의 검토 첫 화면
- apps/worker 워커 health 모듈
- packages/domain, ai, db, auth, queue, storage, ui 공유 패키지
- infra/docker-compose.yml, .env.example, README, scripts/run-e2e.mjs
- Mock STT/회의 분석 Provider와 근거 segment 기반 결정 데모 흐름

검증:
- pnpm install: PASS
- pnpm lint: PASS
- pnpm typecheck: PASS
- pnpm test: PASS
- pnpm test:integration: PASS
- pnpm test:e2e: PASS
- pnpm db:migrate: PASS
- pnpm db:seed: PASS
- pnpm build: PASS
- docker compose -f infra/docker-compose.yml config: FAIL

수정한 문제:
- pnpm 11 dependency build approval과 CI 비대화형 실행 설정
- Next workspace import rootDir 오류
- Playwright webServer teardown 멈춤을 scripts/run-e2e.mjs로 대체
- WebKit 미설치 환경에서 tablet E2E가 실패하던 문제를 Chromium viewport 검증으로 변경

남은 위험:
- 현재 환경에 docker CLI가 없어 PostgreSQL, Redis, MinIO 컨테이너 기동은 미검증
- db:migrate와 db:seed는 Phase 0 placeholder이며 실제 스키마/seed는 Phase 1부터 확장 필요

다음 추천 작업:
- Phase 1 / 사용자 모델, 세션, 조직 생성, 프로젝트 CRUD
```

---

# 34. FINAL COMPLETION CHECKLIST

## 제품

- [ ] 모바일에서 녹음 또는 업로드 가능
- [ ] PC에서 상세 검토 가능
- [ ] 장치 간 데이터 동기화
- [ ] 자동 회의 제목
- [ ] 주간 단일 회의록
- [ ] 주간 통합 보고서
- [ ] 화자 분리와 이름 지정
- [ ] 안건별 상세 정리
- [ ] 결정·할 일·리스크·질문
- [ ] 음성 근거 연결
- [ ] 기록 검색
- [ ] 개발 영향 분석
- [ ] 승인 흐름
- [ ] 내보내기
- [ ] 감사 로그

## 품질

- [ ] 원문 보존
- [ ] 근거 없는 확정 결과 없음
- [ ] 조직 간 데이터 격리
- [ ] 모바일 반응형
- [ ] 키보드 접근성
- [ ] 실패 복구
- [ ] AI 키 없는 Mock 모드
- [ ] 전체 테스트
- [ ] production build

## 운영

- [ ] Docker Compose 로컬 실행
- [ ] 환경 변수 문서
- [ ] DB migration
- [ ] seed
- [ ] health/readiness
- [ ] 로그 민감정보 제거
- [ ] 보존·삭제 정책
- [ ] 배포 문서

---

# 35. FIRST LOOP — 즉시 실행할 작업

Codex는 다음 순서로 바로 시작한다.

```text
1. 현재 저장소 파일 목록을 확인한다.
2. 빈 저장소라면 pnpm 모노레포를 만든다.
3. apps/web, apps/worker, packages/db, packages/domain, packages/ai를 만든다.
4. Docker Compose에 PostgreSQL, Redis, MinIO를 추가한다.
5. DB health와 web health endpoint를 만든다.
6. 기본 반응형 AppShell을 만든다.
7. Vitest와 Playwright를 구성한다.
8. lint, typecheck, test, build를 통과시킨다.
9. Phase 0의 통과한 체크박스만 수정한다.
10. PROGRESS LEDGER를 갱신한다.
11. Phase 1의 인증 수직 기능으로 이동한다.
```

---

# 36. COMPLETION RULE

다음 조건이 모두 충족될 때만 전체 구현 완료를 선언한다.

```text
- P0 체크박스가 모두 [x]
- 출시 필수 P1 체크박스가 모두 [x]
- Release Acceptance Scenario A~E 통과
- lint 통과
- typecheck 통과
- unit 통과
- integration 통과
- e2e 통과
- production build 통과
- Mock Provider만으로 데모 가능
- 실제 Provider를 Adapter로 교체 가능
- 원문, AI 결과, 사용자 확정본이 분리됨
- 모든 확정 결정과 할 일에 근거가 있음
- 모바일과 PC에서 핵심 흐름 수행 가능
```

완료 조건을 충족하지 못했다면 “완료”라고 쓰지 말고 다음 루프로 계속 진행한다.
