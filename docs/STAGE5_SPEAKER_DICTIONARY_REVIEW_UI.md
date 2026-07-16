# 단계 5 — 화자, 사전, 전사, 검토 UI 통합 결과

작성일: 2026-07-16
대상 서버 프로젝트: `C:\Work\HJSolution\MeetingLoop-AI`
참조 로컬 프로젝트: `C:\Work\HJSolution\MeetingLoop-AI-source-20260715`

## 1. 결과 요약

로컬 버전의 화자 검토, 사전, raw/normalized/edited 전사, 추출 항목과 근거 검토 UI를 현재 서버 프로젝트에 통합했다. 단계 0 D2~D3에 따라 검토 중 데이터는 meeting-scoped IndexedDB에만 저장하고 PostgreSQL에는 기존 API로 확정한 전사와 회의록만 저장한다.

로컬 버전의 demo repository와 speaker/dictionary/review 서버 route는 가져오지 않았다. PostgreSQL 스키마에도 브라우저 검토 초안용 table을 추가하지 않았다.

## 2. 모듈 경계

| 모듈 | 역할 |
|---|---|
| `browser-review.ts` | 브라우저 검토 상태, 사전 적용, 화자 병합/분리, 추출/근거 차단, 가상화 계산 |
| `browser-review-store.ts` | 회의별 IndexedDB load/save/delete |
| `TranscriptEditor.tsx` | 화자·사전·3계층 전사·검토 큐 UI와 자동 저장 |
| `RecordingPanel.tsx` | 확정 전사/회의록 서버 API, 녹음 재생, 중요 결정 확정 gate |
| `page.tsx` | PostgreSQL 회의 상세의 참석자 후보를 UI에 전달 |

## 3. 저장 및 버전 정책

- raw, normalized, edited 초안과 confidence, overlap, speaker 상태는 `BROWSER_ONLY` 의미로 IndexedDB에 저장된다.
- 사전, 적용 이력, 편집 이력, speaker cluster, extracted item, evidence 상태도 브라우저에만 저장된다.
- 저장 key는 meeting ID이며 상태에 기준 server transcript version을 함께 기록한다.
- 같은 브라우저 reload에서는 기준 version이 같을 때 검토 초안을 복원한다.
- server transcript version이 달라지면 오래된 문장 초안을 자동 적용하지 않고 사전만 유지한다.
- 다른 브라우저에는 브라우저 초안이 동기화되지 않는다. 다른 브라우저에서 유지되는 것은 PostgreSQL의 확정 전사와 확정 회의록뿐이다.

마지막 항목은 오류가 아니라 단계 0 D3의 의도된 개인정보 경계다. 장치 간 검토 초안 동기화가 필요하면 별도 정책 승인과 암호화/보존/권한 설계가 먼저 필요하다.

## 4. 구현된 검토 흐름

- 화자 cluster별 참석자 배정, cluster 병합, 단일 구간 분리
- raw/normalized/edited 동시 표시와 raw 기반 구간 재처리
- 낮은 confidence, overlap 등급, 미확정 화자 표시
- 사전 수동 추가/삭제, CSV·JSON import, 별칭 일괄 적용과 적용 이력
- 두 번 이상 반복된 단어 교정의 사전 제안
- 문장별 편집/사전/재처리 이력
- 결정, 할 일, 리스크, 미결 질문 후보와 근거 검토 큐
- 결정 후보의 화자 미확정, HIGH overlap, 근거 미확인 차단
- 결정 검토가 남아 있으면 회의록 최종 확정 UI 차단
- 찾기/전체 바꾸기와 server version 기준 초안 충돌 방지
- 녹음 결과의 5초 구간 재생 및 반복 재생
- 40개 초과 문장에 고정 높이/overscan 가상 렌더링

서버는 브라우저 검토 데이터 자체를 받지 않으므로 review 전용 API 차단을 추가하지 않았다. 대신 domain의 `assertDecisionEvidenceSafe` 계약과 브라우저 검토 gate를 유지하고, 서버에는 검토 후 사용자가 확정한 결과만 보낸다.

## 5. 검증 결과

- lint: 통과
- TypeScript: 통과
- unit/API contract: 19 files, 65 tests 통과
- PostgreSQL integration/policy: 11 files, 55 tests, skip 0
- production build: 통과
- Playwright: mobile/tablet/desktop 39 tests 통과(화자·사전·근거 검토와 IndexedDB reload 포함)

단계 5 unit test는 중요 결정 차단/승인, dictionary apply/import/suggestion, raw 재처리, 대량 문장 virtual window를 직접 검증한다. Playwright는 별도 조직과 회의를 사용해 공용 demo 전사 version과 격리한다.

## 6. 알려진 제한과 다음 단계 인계

- 구간 재생은 현재 탭에서 생성된 녹음 URL이 있을 때 동작한다. reload 후 IndexedDB chunk를 하나의 재생 파일로 재조립하는 기능은 아직 없다.
- diarization, STT, overlap 분석은 deterministic/browser metadata 계약이며 실제 분석 provider는 단계 6 범위다.
- 브라우저 초안의 다른 장치 동기화는 정책상 지원하지 않는다.
- 단계 6 worker/provider가 초안 metadata를 만들더라도 D3가 바뀌지 않는 한 결과는 브라우저 경계 안에서 소비해야 한다.
