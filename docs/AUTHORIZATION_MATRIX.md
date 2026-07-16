# MeetingLoop AI 권한 매트릭스

기준 정책 버전: `2026-07-16`

모든 보호 요청은 session token 서명을 확인한 뒤 PostgreSQL membership의 현재 status와 role을 다시 읽는다. `DISABLED` membership과 오래된 token role은 사용할 수 없다. 모든 repository query는 `organizationId`와 필요한 `meetingId`를 함께 검증한다.

| 기능/API | ORG_ADMIN | PROJECT_ADMIN | EDITOR | MEMBER | VIEWER | EXTERNAL |
|---|---:|---:|---:|---:|---:|---:|
| 회의 목록·상세·확정 콘텐츠 조회 | 허용 | 허용 | 허용 | 허용 | 허용 | 현재 구현은 조직 membership 범위 |
| 프로젝트 생성·수정·보관 | 허용 | 허용 | 거부 | 거부 | 거부 | 거부 |
| 회의 생성·녹음 동의 감사 | 허용 | 허용 | 허용 | 거부 | 거부 | 거부 |
| 확정 전사 저장·revision | 허용 | 허용 | 허용 | 거부 | 거부 | 거부 |
| AI 회의록 생성·Gemini 동의 | 허용 | 허용 | 허용 | 거부 | 거부 | 거부 |
| 확정 회의록 저장·revision | 허용 | 허용 | 허용 | 거부 | 거부 | 거부 |
| 회의 전체 삭제 요청 | 허용 | 허용 | 거부 | 거부 | 거부 | 거부 |
| retention purge | worker system만 허용 | - | - | - | - | - |

## API별 공통 방어

| 경로 | 크기 제한 | tenant scope | version/idempotency | 추가 조건 |
|---|---:|---:|---:|---|
| `/api/meetings/{id}/transcript` | 1 MiB | session org + route meeting | version + Idempotency-Key | confirmed edited text만 |
| `/api/meetings/{id}/minutes` | 512 KiB | session org + route meeting | version + Idempotency-Key | confirmed transcript 필요 |
| `/api/meetings/{id}/minutes/generate` | 16 KiB | session org + route meeting | transcript version job ID | Gemini는 현재 정책 동의 필요 |
| `/api/meetings/{id}/recording-consent` | 16 KiB | session org + route meeting | body idempotency key | browser-only 원본 음성 고지 |
| `DELETE /api/meetings/{id}` | 16 KiB | session org + route meeting | body idempotency key | 회의 ID 재입력, 관리자 role |

현재 데이터 모델에는 PROJECT_ADMIN과 특정 project를 연결하는 별도 assignment table이 없다. 따라서 PROJECT_ADMIN은 현재 조직의 프로젝트 관리자 범위로 동작한다. EXTERNAL의 지정 회의 ACL도 아직 별도 테이블이 없어 일반 조직 membership 조회와 동일한 범위다. 두 항목은 세분화된 공유 기능을 도입하기 전에 schema와 negative test를 먼저 추가해야 한다.
