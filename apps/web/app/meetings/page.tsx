import Link from "next/link";
import { getMeetingFilterOptions, listMeetings, type MeetingListOptions } from "@meetingloop/db";
import { redirect } from "next/navigation";
import AppHeader from "../AppHeader";
import { getCurrentSession } from "../session";
import MeetingList from "./MeetingList";
import SearchFilters, { type MeetingSearchParams } from "./SearchFilters";

export const dynamic = "force-dynamic";

interface PageSearchParams extends MeetingSearchParams { cursor?: string }

const meetingStatuses = new Set(["DRAFT", "RECORDING", "UPLOADING", "PROCESSING", "REVIEW", "APPROVED", "FAILED"]);
const meetingTypes = new Set(["REQUIREMENTS", "WEEKLY", "DECISION", "REVIEW", "GENERAL"]);
const confirmationStatuses = new Set(["CONFIRMED", "PENDING"]);

function readOptions(params: PageSearchParams): MeetingListOptions {
  if ((params.status && !meetingStatuses.has(params.status))
    || (params.meetingType && !meetingTypes.has(params.meetingType))
    || (params.transcriptStatus && !confirmationStatuses.has(params.transcriptStatus))
    || (params.minutesStatus && !confirmationStatuses.has(params.minutesStatus))) throw new Error("INVALID_FILTER");
  return {
    cursor: params.cursor, limit: 10, q: params.q, projectId: params.projectId,
    status: params.status as MeetingListOptions["status"],
    meetingType: params.meetingType as MeetingListOptions["meetingType"],
    transcriptStatus: params.transcriptStatus as MeetingListOptions["transcriptStatus"],
    minutesStatus: params.minutesStatus as MeetingListOptions["minutesStatus"],
    createdBy: params.createdBy, from: params.from, to: params.to
  };
}

export default async function MeetingsPage({ searchParams }: { searchParams?: Promise<PageSearchParams> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/?error=session");
  const params = await searchParams;
  try {
    const normalizedParams = params ?? {};
    const filters: MeetingSearchParams = {
      q: normalizedParams.q, projectId: normalizedParams.projectId, status: normalizedParams.status,
      meetingType: normalizedParams.meetingType, transcriptStatus: normalizedParams.transcriptStatus,
      minutesStatus: normalizedParams.minutesStatus, createdBy: normalizedParams.createdBy,
      from: normalizedParams.from, to: normalizedParams.to
    };
    const [page, filterOptions] = await Promise.all([
      listMeetings(session.user.id, session.organization.id, readOptions(normalizedParams)),
      getMeetingFilterOptions(session.user.id, session.organization.id)
    ]);
    return (
      <main className="shell">
        <AppHeader displayName={session.user.displayName} />
        <section className="content-page">
          <header className="content-page-header">
            <div>
              <span className="workspace-label">{session.organization.name}</span>
              <h1>회의록 목록</h1>
              <p className="muted">확정 전사와 최종 회의록의 상태, 참석자와 최종 수정 정보를 확인합니다.</p>
            </div>
            <Link className="button" href="/meetings/new">새 회의 만들기</Link>
          </header>
          <SearchFilters params={filters} options={filterOptions} />
          <MeetingList page={page} searchParams={filters} />
        </section>
      </main>
    );
  } catch (error) {
    const invalidCursor = error instanceof Error && error.message === "INVALID_CURSOR";
    const invalidFilter = error instanceof Error && error.message === "INVALID_FILTER";
    return (
      <main className="shell">
        <AppHeader displayName={session.user.displayName} />
        <section className="content-page"><div className="empty-state" role="alert">
          <strong>{invalidCursor ? "페이지 정보를 확인할 수 없습니다" : invalidFilter ? "검색 조건을 확인해 주세요" : "회의록 목록을 불러오지 못했습니다"}</strong>
          <p>{invalidCursor ? "잘못되었거나 만료된 페이지 주소입니다. 첫 페이지부터 다시 조회해 주세요." : invalidFilter ? "검색어는 100자 이내로 입력하고 시작일이 종료일보다 늦지 않도록 확인해 주세요." : "잠시 후 다시 시도하고, 문제가 계속되면 서버 상태를 확인해 주세요."}</p>
          <Link className="button" href="/meetings">첫 페이지로 이동</Link>
        </div></section>
      </main>
    );
  }
}
