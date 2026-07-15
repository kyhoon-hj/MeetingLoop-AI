# 단계 4 최종 전사 실테스트 가이드

## 사전 조건

```powershell
$env:DATABASE_URL="postgresql://postgres:pgpass@localhost:5432/meeting"
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm dev:3101
```

브라우저에서 `http://localhost:3101`에 접속하고 데모 계정으로 로그인한다. 원본 음성은 브라우저 IndexedDB에만 임시 보관되며, 이 단계에서 서버 DB에는 최종 확정 전사와 수정 이력만 저장한다.

## 성공 케이스

1. 전사 문장을 추가하고 내용을 수정한 뒤 **최종 전사 확정**을 누른다.
2. 화면에 `서버 v1`과 최종 수정 시각이 표시되는지 확인한다.
3. 새로고침 후 같은 문장과 버전이 다시 조회되는지 확인한다.
4. 문장을 수정하고 다시 확정하여 버전이 증가하는지 확인한다.
5. **TXT 다운로드**로 받은 파일에 시각, 화자, 최종 문장이 UTF-8 한글로 들어 있는지 확인한다.
6. **서버 저장본 다시 불러오기**가 저장된 내용으로 화면을 복구하는지 확인한다.
7. DB에서 현재 전사와 이전 revision을 확인한다.

```sql
select id, meeting_id, version, updated_at from transcripts order by updated_at desc;
select transcript_id, version, created_at from transcript_revisions order by created_at desc;
select transcript_id, sequence, speaker_label, edited_text from transcript_segments order by transcript_id, sequence;
```

## 실패 및 예외 케이스

| 케이스 | 실행 방법 | 기대 결과 |
|---|---|---|
| 빈 전사 | 모든 문장을 삭제하고 최종 전사 확정 | 저장 요청 없이 “저장할 전사 문장이 없습니다” 알림 |
| 문장 길이 초과 | 한 문장에 4,001자 입력 후 확정 | 400 응답과 문장당 4,000자 제한 알림 |
| 세그먼트 초과 | API로 201개 문장 전송 | 400 응답과 최대 200개 제한 알림 |
| 요청 크기 초과 | 1MB를 초과하는 JSON 전송 | 413 응답과 요청 크기 안내 |
| 버전 충돌 | 동일 버전을 두 화면에서 열고 차례로 수정 저장 | 뒤 요청은 409, 로컬 수정은 유지되고 다시 불러오기 안내 |
| 조회 권한 없음 | 다른 조직의 meeting ID로 조회 | 404로 리소스 존재 여부를 노출하지 않음 |
| 수정 권한 없음 | VIEWER 역할로 조회 후 저장 | 조회는 가능하고 저장은 403 |
| 미로그인 | 세션 없이 API 요청 | 401 |
| 네트워크 중단 | 서버를 중지한 뒤 조회·저장 | 연결 상태 확인을 안내하는 공통 팝업 |

버전 충돌 후에는 로컬 내용을 별도로 복사하거나 유지한 상태에서 **서버 저장본 다시 불러오기**를 누르고 최신 버전에 수정 내용을 다시 반영한다. 다시 불러오기는 로컬 수정 삭제 확인 팝업을 거쳐야 한다.

## 자동 검증

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:integration
corepack pnpm test:e2e
corepack pnpm build
```

- 단위 테스트: 입력 스키마, JSON 파싱, 1MB 제한
- DB 통합 테스트: 최초 저장, 재조회, revision, 버전 충돌, 조직 격리, VIEWER 권한
- E2E: 모바일·태블릿·데스크톱에서 저장/TXT 다운로드와 실패 알림, 충돌 시 로컬 내용 유지

## 완료 판정

- 성공 케이스가 모두 통과한다.
- 실패 케이스가 HTTP 상태 코드와 사용자가 이해할 수 있는 알림으로 처리된다.
- 실패한 저장이 현재 전사와 revision을 부분 변경하지 않는다.
- 서버 로그에 전사 본문이나 원본 음성 데이터가 기록되지 않는다.
