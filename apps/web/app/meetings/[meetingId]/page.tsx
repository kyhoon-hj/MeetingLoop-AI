import Link from "next/link";
import { getMeetingDetail } from "@meetingloop/db";
import { redirect } from "next/navigation";
import AppHeader from "../../AppHeader";
import { getCurrentSession } from "../../session";
import MeetingDetail from "../MeetingDetail";

export const dynamic = "force-dynamic";

export default async function MeetingDetailPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/?error=session");
  const { meetingId } = await params;
  try {
    const detail = await getMeetingDetail(session.user.id, session.organization.id, meetingId);
    return (
      <main className="shell">
        <AppHeader displayName={session.user.displayName} />
        <section className="content-page">
          <nav className="breadcrumb" aria-label="현재 위치"><Link href="/meetings">회의록 목록</Link><span>/</span><span>상세 조회</span></nav>
          <MeetingDetail detail={detail} canDelete={session.membership.role === "ORG_ADMIN" || session.membership.role === "PROJECT_ADMIN"} />
        </section>
      </main>
    );
  } catch {
    return (
      <main className="shell">
        <AppHeader displayName={session.user.displayName} />
        <section className="content-page"><div className="empty-state" role="alert">
          <strong>회의를 찾을 수 없습니다</strong>
          <p>삭제되었거나 현재 조직에서 접근할 수 없는 회의입니다.</p>
          <Link className="button" href="/meetings">회의록 목록으로 이동</Link>
        </div></section>
      </main>
    );
  }
}
