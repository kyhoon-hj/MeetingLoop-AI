# MeetingLoop AI 데이터베이스 및 회의록 기능 구현 계획

## 1. 목적

현재 MeetingLoop AI는 사용자, 프로젝트, 회의, 전사 및 회의록 데이터를 Node.js 프로세스 메모리에 저장한다. 따라서 컨테이너를 재시작하거나 새 버전을 배포하면 데이터가 초기화된다.

이 문서의 목표는 PostgreSQL 영속 저장을 도입하고 다음 기능을 운영 가능한 수준으로 구현하기 위한 작업 범위와 순서를 정의하는 것이다.

- 사용자·조직·프로젝트 영속 저장
- 회의 및 전사 TXT 저장
- AI 생성 회의록 저장
- 회의록 목록과 페이지네이션
- 회의록 검색 및 필터
- 회의록 상세 조회
- 전사 및 회의록 수정
- 변경 이력과 동시 수정 충돌 방지
- 조직별 데이터 접근 제한

## 2. 현재 상태

### 구현되어 있는 부분

- PostgreSQL 초기 스키마 파일
- 사용자, 조직, 프로젝트, 회의, 참석자 데이터 모델
- 전사 세그먼트 및 회의록 데이터 모델
- 로그인 및 역할 기반 권한 모델
- 전사 저장 API 형태
- AI 회의록 생성 및 확정 API 형태
- 회의록 초안 편집 UI
- Docker 기반 Next.js 배포

### 보완이 필요한 부분

- `packages/db`가 PostgreSQL 대신 `DemoState` 메모리 객체를 사용한다.
- `db:migrate`와 `db:seed`가 실제 SQL을 실행하지 않는다.
- PostgreSQL connection pool과 transaction 처리가 없다.
- 로그인과 회원가입 데이터도 메모리에만 저장된다.
- 회의 목록, 검색, 상세 조회 화면이 분리되어 있지 않다.
- 회의록 변경 이력과 동시 수정 충돌 처리가 없다.
- 현재 워크스페이스 화면은 가장 최근 회의 하나만 표시한다.

## 3. 운영 데이터베이스 구성

운영 환경에서는 AWS RDS PostgreSQL 사용을 권장한다. 초기 테스트에서는 EC2의 Docker PostgreSQL과 영구 볼륨을 사용할 수 있지만, 실제 데이터를 저장하기 시작하면 자동 백업과 장애 복구가 제공되는 RDS로 분리하는 것이 안전하다.

필요한 환경변수 예시는 다음과 같다.

```dotenv
DATABASE_URL=postgresql://user:password@database-host:5432/meetingloop
DATABASE_SSL=true
DB_POOL_MAX=10
```

DB 비밀번호는 Git과 Docker 이미지에 포함하지 않는다. AWS Secrets Manager, SSM Parameter Store 또는 서버의 비공개 `.env.docker`에서 관리한다.

## 4. DB 패키지 구조

현재 `packages/db/src/index.ts`에 모여 있는 메모리 저장소를 PostgreSQL repository 구조로 분리한다.

```text
packages/db/src/
├─ pool.ts
├─ transaction.ts
├─ errors.ts
├─ repositories/
│  ├─ auth.repository.ts
│  ├─ project.repository.ts
│  ├─ meeting.repository.ts
│  ├─ transcript.repository.ts
│  └─ minutes.repository.ts
├─ mappings/
└─ index.ts
```

필수 구현 항목:

- `pg.Pool` 생성 및 재사용
- 연결 및 쿼리 timeout 설정
- 트랜잭션 공통 함수
- SQL 결과를 domain 타입으로 변환
- PostgreSQL 오류를 애플리케이션 오류로 변환
- 프로세스 종료 시 connection pool 정리
- 모든 업무 데이터 쿼리에 `organization_id` 조건 적용

기존 함수의 `Demo` 명칭도 제거한다.

```text
getDemoWorkspace                 → getWorkspace
saveDemoTranscriptSegments      → saveTranscriptSegments
generateDemoMinutesFromTranscript → generateMinutesFromTranscript
confirmDemoMinutes              → updateMinutes
```

## 5. 마이그레이션

실제 migration runner를 구현한다.

- `schema_migrations` 테이블 생성
- 마이그레이션 파일 이름순 실행
- 이미 적용된 마이그레이션 제외
- 마이그레이션 단위 트랜잭션 적용
- 실패 시 non-zero exit와 롤백
- 개발 seed와 운영 seed 분리
- 배포 시 웹 컨테이너 시작 전에 한 번만 실행

회의록 수정 충돌과 변경 이력을 위해 다음 필드를 추가한다.

```sql
alter table meeting_minutes
  add column version integer not null default 1,
  add column updated_by text references users(id);

alter table transcript_segments
  add column version integer not null default 1;
```

회의록 변경 이력 테이블도 추가한다.

```text
meeting_minutes_revisions
├─ id
├─ meeting_minutes_id
├─ version
├─ snapshot jsonb
├─ changed_by
└─ created_at
```

외래키 삭제 정책도 명시한다.

- 회의 삭제 시 전사와 회의록은 `ON DELETE CASCADE`
- 사용자 데이터는 실제 삭제보다 비활성화 권장
- 프로젝트와 회의는 archive 방식 유지

## 6. 검색 기능

### 검색 대상

- 회의 제목
- 회의록 제목과 요약
- 핵심 내용 및 논의 내용
- 결정 사항과 할 일
- 수정된 전사 내용
- 참석자 이름

### 검색 필터

- 프로젝트
- 회의 상태
- 회의 유형
- 작성자
- 시작일과 종료일
- 회의록 확정 여부

한국어 부분 문자열 검색의 첫 단계로 PostgreSQL `pg_trgm`을 사용한다.

```sql
create extension if not exists pg_trgm;

create index meeting_minutes_title_trgm_idx
on meeting_minutes using gin (title gin_trgm_ops);

create index meeting_minutes_summary_trgm_idx
on meeting_minutes using gin (summary gin_trgm_ops);

create index transcript_edited_text_trgm_idx
on transcript_segments using gin (edited_text gin_trgm_ops);
```

초기에는 `ILIKE`와 trigram index를 사용한다. 데이터 규모가 커지고 형태소 기반 검색이 필요해지면 OpenSearch 도입을 별도로 검토한다.

목록은 cursor 페이지네이션을 사용한다.

```text
기본 조회 수: 20개
정렬: started_at DESC, id DESC
```

## 7. API 계획

### 회의 목록 및 검색

```http
GET /api/meetings?q=&projectId=&status=&from=&to=&cursor=
```

```json
{
  "items": [],
  "nextCursor": "..."
}
```

### 회의 상세

```http
GET /api/meetings/{meetingId}
```

반환 범위:

- 회의 기본정보
- 프로젝트
- 참석자와 안건
- 전사 세그먼트
- 회의록
- 현재 수정 버전

### 회의 정보 수정

```http
PATCH /api/meetings/{meetingId}
```

### 전사 조회 및 저장

```http
GET /api/meetings/{meetingId}/transcript
PUT /api/meetings/{meetingId}/transcript
```

### 회의록 조회 및 수정

```http
GET /api/meetings/{meetingId}/minutes
PUT /api/meetings/{meetingId}/minutes
```

### AI 회의록 생성

```http
POST /api/meetings/{meetingId}/minutes/generate
```

수정 요청에는 클라이언트가 조회한 버전을 포함한다.

```json
{
  "version": 3,
  "title": "회의 제목",
  "summary": "회의 요약",
  "keyPoints": []
}
```

DB의 현재 버전과 요청 버전이 다르면 `409 Conflict`를 반환하여 다른 사용자의 변경을 덮어쓰지 않도록 한다.

## 8. 화면 계획

### 회의록 목록 `/meetings`

- 검색어 입력
- 프로젝트, 기간, 상태 필터
- 회의 제목과 프로젝트명
- 회의 일시와 참석자
- 회의록 상태
- 최종 수정자와 수정일
- cursor 페이지네이션

### 회의록 상세 `/meetings/[meetingId]`

- 회의 기본정보
- AI 회의록
- 전사 TXT
- 참석자와 안건
- 수정 이력
- 편집 및 AI 재생성 버튼

### 회의록 편집 `/meetings/[meetingId]/edit`

- 제목과 요약
- 핵심 내용과 논의 내용
- 결정 사항
- 할 일, 담당자, 기한
- 리스크와 미결 질문
- 임시 저장과 최종 확정
- 수정 취소
- 버전 충돌 안내

현재 `RecordingPanel.tsx`는 녹음, 전사, AI 생성, 회의록 편집이 하나에 포함되어 있으므로 다음 컴포넌트로 분리한다.

```text
RecordingPanel
TranscriptEditor
MinutesEditor
MeetingList
MeetingDetail
SearchFilters
RevisionHistory
```

## 9. 인증과 권한

세션 토큰의 역할만 신뢰하지 않고 요청마다 DB에서 membership 상태와 조직 범위를 확인한다.

1. 세션 사용자 조회
2. membership이 `ACTIVE`인지 확인
3. 요청한 회의의 `organization_id` 확인
4. 역할별 조회·수정 권한 확인

| 역할 | 조회 | 전사 수정 | 회의록 수정 | 확정 |
|---|---:|---:|---:|---:|
| ORG_ADMIN | 가능 | 가능 | 가능 | 가능 |
| PROJECT_ADMIN | 가능 | 가능 | 가능 | 가능 |
| EDITOR | 가능 | 가능 | 가능 | 가능 |
| MEMBER | 가능 | 제한 | 제한 | 불가 |
| VIEWER | 가능 | 불가 | 불가 | 불가 |
| EXTERNAL | 지정 회의만 | 불가 | 불가 | 불가 |

## 10. 구현 단계

### 1단계: PostgreSQL 기반 마련

- [ ] 운영 PostgreSQL 생성
- [ ] 실제 migration runner 구현
- [ ] DB pool과 transaction 구현
- [ ] Docker 환경변수 연결
- [ ] DB readiness healthcheck 구현
- [ ] 개발 및 운영 seed 분리

### 2단계: 인증과 기본 데이터 영속화

- [ ] 사용자·조직·membership DB 전환
- [ ] 로그인 및 회원가입 DB 전환
- [ ] 프로젝트 DB 전환
- [ ] 요청마다 membership 재검증
- [ ] 기존 데모 메모리 저장소 제거

### 3단계: 회의·전사·회의록 저장

- [ ] 회의 생성 및 조회 DB 전환
- [ ] 전사 저장, 조회, 수정 구현
- [ ] AI 생성 결과를 `meeting_minutes`에 저장
- [ ] 회의록 확정 및 재수정 구현
- [ ] 관련 작업에 DB 트랜잭션 적용

### 4단계: 목록·검색·상세 화면

- [ ] `/meetings` 목록 화면
- [ ] 검색 및 필터
- [ ] cursor 페이지네이션
- [ ] `/meetings/[id]` 상세 화면
- [ ] 빈 결과, 로딩, 오류 상태 처리

### 5단계: 편집과 변경 이력

- [ ] 회의록 편집 화면
- [ ] optimistic locking
- [ ] revision 저장 및 조회
- [ ] 수정자와 수정 시각 표시
- [ ] 동시 수정 충돌 UI

### 6단계: 운영 안정화

- [ ] DB 자동 백업
- [ ] migration 배포 절차
- [ ] API rate limit
- [ ] 감사 로그
- [ ] 검색 성능 측정
- [ ] 통합 및 E2E 테스트
- [ ] 장애 및 복구 테스트

## 11. 완료 기준

다음 시나리오를 모두 통과하면 1차 구현 완료로 판단한다.

1. 컨테이너 재시작 후에도 사용자와 회의록이 유지된다.
2. 다른 조직 사용자는 회의 ID를 알아도 데이터를 조회할 수 없다.
3. 회의록 생성 후 목록에 즉시 표시된다.
4. 제목, 요약, 전사 내용으로 검색할 수 있다.
5. 프로젝트, 기간, 상태 필터가 동작한다.
6. 상세 화면에서 회의록과 전사를 조회할 수 있다.
7. 권한이 있는 사용자가 회의록을 수정할 수 있다.
8. 동시 수정 시 이전 변경을 덮어쓰지 않는다.
9. 수정 이전 버전을 조회할 수 있다.
10. DB 장애 시 readiness healthcheck가 실패한다.
11. migration과 백업 복구 절차가 검증된다.

## 12. 우선 구현 범위

먼저 1단계부터 3단계까지 완료하여 데이터가 실제 PostgreSQL에 저장되도록 한다. 이후 목록·검색·상세 화면을 구현하면 저장 구조를 다시 변경하는 비용을 줄일 수 있다.

첫 번째 개발 목표는 다음과 같다.

```text
PostgreSQL 연결
→ 실제 migration
→ 로그인과 조직 영속화
→ 회의 및 전사 저장
→ AI 회의록 저장
→ 컨테이너 재시작 후 데이터 유지 확인
```
