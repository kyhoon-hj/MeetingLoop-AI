# 3단계 실제 테스트 가이드

## 1. 검증 범위

3단계는 사용자·조직·멤버십·프로젝트·회의 기본정보를 메모리가 아닌 PostgreSQL에 저장하는 단계다. 다음 사항을 실제 DB를 사용해 확인한다.

- 가입과 로그인 데이터의 영속성
- 프로젝트 생성·수정·보관·복원
- 회의, 참석자, 안건과 로컬 전용 녹음 메타데이터 저장
- 웹 프로세스 재시작 후 데이터 유지
- 비활성 멤버십의 기존 세션 차단
- 세션 토큰이 아닌 DB의 현재 역할 사용
- 조직 간 데이터 격리

원본 음성 파일과 브라우저 녹음 청크는 이 테스트에서도 서버나 PostgreSQL에 저장하지 않는다.

## 2. 사전 준비

저장소 루트의 `.env` 또는 현재 PowerShell 환경에 로컬 PostgreSQL 연결 정보를 설정한다. 실제 비밀번호는 Git에 커밋하지 않는다.

```powershell
$env:DATABASE_URL = "postgresql://postgres:<LOCAL_PASSWORD>@localhost:5432/meeting"
$env:DATABASE_SSL = "false"
```

DB가 준비되어 있다면 마이그레이션과 개발 seed를 적용한다.

```powershell
pnpm db:migrate
pnpm db:seed
```

준비 상태를 자동 검증한다.

```powershell
pnpm exec vitest run tests/integration/stage3-auth-persistence.integration.test.ts --environment node --testTimeout 15000
```

이 테스트는 매번 고유한 조직과 사용자를 실제 DB에 생성하고, 가입·로그인·프로젝트·회의·권한·tenant 격리를 검증한 후 테스트 데이터를 삭제한다.

## 3. 3101 포트에서 화면 테스트

```powershell
pnpm dev:3101
```

브라우저에서 `http://127.0.0.1:3101`로 접속한다. 개발 seed 계정은 다음과 같다.

```text
admin@example.com
ChangeMe123!
```

준비 상태는 `http://127.0.0.1:3101/api/health/ready`에서 확인한다. 응답의 `status`가 `ok`이고 HTTP 상태가 `200`이어야 한다.

## 4. 수동 테스트 케이스

| ID | 테스트 | 수행 방법 | 기대 결과 |
|---|---|---|---|
| S3-01 | DB 준비 상태 | `/api/health/ready` 접속 | HTTP 200, `status: ok` |
| S3-02 | seed 로그인 | 개발 seed 계정으로 로그인 | 관리자 화면과 조직명이 표시됨 |
| S3-03 | 신규 가입 transaction | “새 조직 만들기”에서 고유 이메일과 조직 주소로 가입 | 사용자·조직·ORG_ADMIN 멤버십이 함께 생성되고 자동 로그인됨 |
| S3-04 | 중복 가입 rollback | S3-03과 같은 이메일 또는 조직 주소로 다시 가입 | 중복 안내가 나오며 사용자·조직 일부만 남는 불완전 데이터가 생성되지 않음 |
| S3-05 | 회의 기본정보 저장 | 로그인 후 메인 화면을 표시 | 빠른 녹음 프로젝트와 회의가 DB에 생성되고 화면에 현재 기록이 표시됨 |
| S3-06 | 프로세스 재시작 영속성 | 서버 종료 후 `pnpm dev:3101`으로 재실행하고 다시 로그인 | 같은 조직과 기존 회의가 유지됨 |
| S3-07 | 멤버십 즉시 차단 | 로그인 상태에서 DB 멤버십을 `DISABLED`로 변경한 후 새로고침 | 기존 쿠키가 있어도 로그인 화면으로 전환되고 업무 API는 401 |
| S3-08 | 현재 역할 재검증 | 로그인 상태에서 DB 역할을 `VIEWER`로 변경 후 저장 API 호출 | 예전 관리자 쿠키와 무관하게 쓰기 작업이 HTTP 403으로 차단됨 |
| S3-09 | 조직 격리 | 자동 통합 테스트의 다른 조직 project ID 접근 케이스 실행 | 조회 결과가 노출되지 않고 수정은 `PROJECT_NOT_FOUND`로 차단됨 |
| S3-10 | 원본 음성 비저장 | 녹음 후 PostgreSQL `recordings` 확인 | 파일 본문·저장 경로 없이 `LOCAL_ONLY` 메타데이터만 존재함 |

## 5. 재시작 영속성 확인용 SQL

seed 계정의 조직·프로젝트·회의가 DB에 존재하는지 확인한다.

```powershell
psql "$env:DATABASE_URL" -c "select u.email, o.name, m.role, m.status from users u join memberships m on m.user_id=u.id join organizations o on o.id=m.organization_id where u.email='admin@example.com';"
psql "$env:DATABASE_URL" -c "select p.name, p.status, count(mt.id) as meetings from projects p left join meetings mt on mt.project_id=p.id where p.organization_id='org-demo' group by p.id order by p.created_at;"
```

웹 서버를 종료하고 다시 실행한 뒤 같은 SQL 결과와 화면의 현재 기록이 유지되는지 확인한다.

## 6. 기존 세션 차단 테스트

먼저 브라우저에서 seed 계정으로 로그인한 상태를 유지한다. 별도 PowerShell에서 다음 SQL을 실행한다.

```powershell
psql "$env:DATABASE_URL" -c "update memberships set status='DISABLED' where organization_id='org-demo' and user_id='user-admin';"
```

브라우저를 새로고침하면 로그인 화면이 표시되어야 한다. 테스트 후 계정을 반드시 복구한다.

```powershell
psql "$env:DATABASE_URL" -c "update memberships set status='ACTIVE', role='ORG_ADMIN' where organization_id='org-demo' and user_id='user-admin';"
```

## 7. DB 역할 재검증 테스트

관리자로 로그인한 상태에서 역할만 변경한다.

```powershell
psql "$env:DATABASE_URL" -c "update memberships set role='VIEWER' where organization_id='org-demo' and user_id='user-admin';"
```

브라우저의 기존 세션 쿠키에는 로그인 당시 역할이 들어 있어도 서버는 요청마다 DB 역할을 다시 읽는다. 전사 확정 등 쓰기 작업은 403으로 거부되어야 한다. 완료 후 역할을 복구한다.

```powershell
psql "$env:DATABASE_URL" -c "update memberships set role='ORG_ADMIN' where organization_id='org-demo' and user_id='user-admin';"
```

## 8. 전체 자체 검증

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm --filter @meetingloop/web build
```

E2E 테스트는 충돌 방지를 위해 자체적으로 3210 포트를 사용한다. 실제 수동 확인 URL은 서비스 실행 포트인 3101이다.
