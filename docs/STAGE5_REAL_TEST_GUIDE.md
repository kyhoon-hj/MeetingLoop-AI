# 단계 5 AI 회의록 실테스트 가이드

## 사전 조건

```powershell
$env:DATABASE_URL="postgresql://postgres:pgpass@localhost:5432/meeting"
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm dev:3101
```

로컬 AI는 Ollama와 설정된 모델이 실행 중이어야 한다. Gemini는 `apps/web/.env.local`에 `GEMINI_API_KEY`, `GEMINI_MODEL`을 설정하고 서버를 재시작한다.

## 성공 케이스

1. 전사 문장을 **최종 전사 확정**으로 서버에 먼저 저장한다.
2. **회의록·보고서** 화면에서 AI 제공자를 선택하고 **AI 보고서 생성**을 누른다.
3. 제목·요약·결정·할 일 등 생성 초안이 표시되는지 확인한다.
4. 내용을 수정하고 **회의록 최종 확정**을 눌러 저장 완료 팝업과 `서버 v1`을 확인한다.
5. 새로고침하거나 **저장된 회의록 불러오기**를 눌러 동일한 내용이 복구되는지 확인한다.
6. 다시 수정·확정하여 v2로 증가하고 이전 v1 revision이 남는지 확인한다.

```sql
select id, meeting_id, version, status, updated_at from meeting_minutes order by updated_at desc;
select meeting_minutes_id, version, created_at from meeting_minutes_revisions order by created_at desc;
```

## 실패 및 예외 케이스

| 케이스 | 기대 결과 |
|---|---|
| 확정 전사 없이 AI 생성 | 409와 “최종 전사가 필요합니다” 팝업 |
| AI 생성 중 같은 회의 재요청 | 409와 생성 진행 중 안내 |
| Ollama/Gemini 연결 실패 | 503과 제공자 연결·설정 안내 |
| AI 응답 시간 초과 | 504와 시간 초과 안내 |
| 잘못된 AI 응답 형식 | 502와 다시 생성 안내 |
| Gemini 사용량 제한 | 429와 잠시 후 재시도 안내 |
| 두 화면에서 같은 버전 수정 | 뒤 저장은 409, 로컬 수정 내용 유지 |
| VIEWER 역할로 저장 | 403, 조회는 허용 |
| 다른 조직 회의록 조회 | 404로 존재 여부를 노출하지 않음 |
| 잘못된 제목·요약·항목 길이 | 400과 입력 확인 안내 |

## 자동 검증

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
$env:DATABASE_URL="postgresql://postgres:pgpass@localhost:5432/meeting"
corepack pnpm test:integration
corepack pnpm test:e2e
corepack pnpm build
```

- 단위 테스트: 회의록 입력 스키마와 AI timeout
- DB 통합 테스트: 확정 전사 강제, v1/v2 저장, revision, 버전 충돌, 권한 및 조직 격리
- E2E: 저장 성공 팝업, 전사 미확정 안내, 회의록 충돌 시 로컬 내용 유지

## 저장 및 로그 정책

- AI에는 DB에 저장된 최종 확정 전사 텍스트만 전달한다.
- 원본 음성과 화면의 미확정 전사는 AI 생성 요청에 포함하지 않는다.
- AI 생성 초안은 사용자가 최종 확정하기 전까지 DB에 저장하지 않는다.
- 애플리케이션 로그에는 전사 본문, AI 요청 전문 또는 AI 응답 전문을 기록하지 않는다.
