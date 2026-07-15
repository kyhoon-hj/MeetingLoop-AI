import Link from "next/link";
import type { MeetingListPage } from "@meetingloop/db";
import { meetingSearchQuery, type MeetingSearchParams } from "./SearchFilters";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" })
    .format(new Date(value));
}

export default function MeetingList({ page, searchParams }: { page: MeetingListPage; searchParams: MeetingSearchParams }) {
  const hasFilters = Object.values(searchParams).some(Boolean);
  if (page.items.length === 0) {
    return (
      <section className="empty-state" role="status">
        <strong>{hasFilters ? "검색 조건에 맞는 회의가 없습니다" : "조회할 회의가 없습니다"}</strong>
        <p>{hasFilters ? "검색어나 필터 범위를 줄이거나 조건을 초기화해 주세요." : "새 회의를 만들면 이곳에서 전사와 최종 회의록을 조회할 수 있습니다."}</p>
        <Link className="button" href={hasFilters ? "/meetings" : "/meetings/new"}>{hasFilters ? "검색 조건 초기화" : "새 회의 만들기"}</Link>
      </section>
    );
  }

  return (
    <>
      <div className="search-result-summary" role="status"><strong>{page.totalCount.toLocaleString("ko-KR")}개</strong>의 회의를 찾았습니다.</div>
      <div className="meeting-list" aria-label="회의록 목록">
        {page.items.map((meeting) => (
          <article className="meeting-list-card" key={meeting.id}>
            <div className="meeting-list-main">
              <span className="workspace-label">{meeting.projectName}</span>
              <h2><Link href={`/meetings/${encodeURIComponent(meeting.id)}`}>{meeting.title}</Link></h2>
              <p className="muted">{formatDate(meeting.startedAt)} · 참석자 {meeting.participantNames.length}명</p>
              <p className="participant-summary">
                {meeting.participantNames.length > 0 ? meeting.participantNames.join(", ") : "등록된 참석자 없음"}
              </p>
            </div>
            <div className="meeting-list-status">
              <span className={`content-status ${meeting.transcriptConfirmed ? "complete" : "pending"}`}>
                전사 {meeting.transcriptConfirmed ? `확정 v${meeting.transcriptVersion}` : "대기"}
              </span>
              <span className={`content-status ${meeting.minutesConfirmed ? "complete" : "pending"}`}>
                회의록 {meeting.minutesConfirmed ? `확정 v${meeting.minutesVersion}` : "대기"}
              </span>
              <small>최종 수정 {meeting.updatedByName} · {formatDate(meeting.updatedAt)}</small>
              <Link className="button secondary" href={`/meetings/${encodeURIComponent(meeting.id)}`}>상세 조회</Link>
            </div>
          </article>
        ))}
      </div>
      <nav className="cursor-pagination" aria-label="회의록 페이지 이동">
        {page.nextCursor ? (
          <Link className="button secondary" href={`/meetings${meetingSearchQuery(searchParams, page.nextCursor)}`}>다음 페이지</Link>
        ) : <span className="muted">마지막 페이지입니다.</span>}
      </nav>
    </>
  );
}
