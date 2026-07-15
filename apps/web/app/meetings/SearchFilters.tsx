import Link from "next/link";
import type { MeetingFilterOptions } from "@meetingloop/db";

export interface MeetingSearchParams {
  q?: string | undefined;
  projectId?: string | undefined;
  status?: string | undefined;
  meetingType?: string | undefined;
  transcriptStatus?: string | undefined;
  minutesStatus?: string | undefined;
  createdBy?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function meetingSearchQuery(params: MeetingSearchParams, cursor?: string | null): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  if (cursor) query.set("cursor", cursor);
  const value = query.toString();
  return value ? `?${value}` : "";
}

export default function SearchFilters({ params, options }: {
  params: MeetingSearchParams;
  options: MeetingFilterOptions;
}) {
  const advancedActive = Boolean(params.projectId || params.status || params.meetingType || params.transcriptStatus
    || params.minutesStatus || params.createdBy || params.from || params.to);
  const activeCount = Object.values(params).filter(Boolean).length;

  return (
    <form className="meeting-search" action="/meetings" method="get" role="search">
      <div className="search-primary-row">
        <label className="search-query-field">
          <span className="sr-only">회의록 통합 검색</span>
          <input name="q" defaultValue={params.q} maxLength={100} placeholder="회의 제목, 참석자, 최종 전사와 회의록 검색" />
        </label>
        <button className="button" type="submit">검색</button>
        {activeCount > 0 ? <Link className="button secondary" href="/meetings">초기화</Link> : null}
      </div>
      <details className="search-advanced" open={advancedActive}>
        <summary>상세 필터 {advancedActive ? <span>{activeCount - (params.q ? 1 : 0)}개 적용</span> : null}</summary>
        <div className="search-filter-grid">
          <label>프로젝트<select name="projectId" defaultValue={params.projectId ?? ""}>
            <option value="">전체 프로젝트</option>
            {options.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select></label>
          <label>회의 상태<select name="status" defaultValue={params.status ?? ""}>
            <option value="">전체 상태</option><option value="DRAFT">작성 전</option><option value="RECORDING">녹음 중</option>
            <option value="UPLOADING">처리 준비</option><option value="PROCESSING">처리 중</option><option value="REVIEW">검토 중</option>
            <option value="APPROVED">승인 완료</option><option value="FAILED">처리 실패</option>
          </select></label>
          <label>회의 유형<select name="meetingType" defaultValue={params.meetingType ?? ""}>
            <option value="">전체 유형</option><option value="GENERAL">일반</option><option value="WEEKLY">주간</option>
            <option value="REQUIREMENTS">요구사항</option><option value="DECISION">의사결정</option><option value="REVIEW">검토</option>
          </select></label>
          <label>최종 전사<select name="transcriptStatus" defaultValue={params.transcriptStatus ?? ""}>
            <option value="">전체</option><option value="CONFIRMED">확정</option><option value="PENDING">미확정</option>
          </select></label>
          <label>최종 회의록<select name="minutesStatus" defaultValue={params.minutesStatus ?? ""}>
            <option value="">전체</option><option value="CONFIRMED">확정</option><option value="PENDING">미확정</option>
          </select></label>
          <label>작성자<select name="createdBy" defaultValue={params.createdBy ?? ""}>
            <option value="">전체 작성자</option>
            {options.creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.displayName}</option>)}
          </select></label>
          <label>시작일<input name="from" type="date" defaultValue={params.from ?? ""} /></label>
          <label>종료일<input name="to" type="date" defaultValue={params.to ?? ""} /></label>
        </div>
        <div className="search-filter-actions"><button className="button secondary" type="submit">필터 적용</button></div>
      </details>
    </form>
  );
}
