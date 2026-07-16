import Link from "next/link";
import { getWorkspace } from "@meetingloop/db";
import { redirect } from "next/navigation";
import AppHeader from "../../AppHeader";
import QueryErrorDialog from "../../QueryErrorDialog";
import { getCurrentSession } from "../../session";
import NewMeetingForm from "./NewMeetingForm";

export const dynamic = "force-dynamic";

function creationError(error: string | undefined) {
  if (!error) return null;
  if (error === "MEETING_INPUT_INVALID") return {
    title: "회의 정보를 확인해 주세요",
    message: "회의 제목, 프로젝트, 참석자, 안건 및 녹음 동의 항목을 다시 확인해 주세요."
  };
  if (error === "MEETING_CREATE_FORBIDDEN") return {
    title: "회의 생성 권한이 없습니다",
    message: "조직 관리자, 프로젝트 관리자 또는 편집자에게 회의 생성을 요청해 주세요."
  };
  if (error === "PROJECT_NOT_FOUND") return {
    title: "프로젝트를 사용할 수 없습니다",
    message: "프로젝트가 보관 처리되었거나 삭제되었습니다. 다른 프로젝트를 선택해 주세요."
  };
  return { title: "회의를 만들지 못했습니다", message: "잠시 후 다시 시도하고, 문제가 계속되면 관리자에게 문의해 주세요." };
}

export default async function NewMeetingPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/?error=session");
  const workspace = await getWorkspace(session.user.id, session.organization.id);
  const params = await searchParams;
  if (!workspace) redirect("/?error=session");

  return (
    <main className="shell">
      <QueryErrorDialog feedback={creationError(params?.error)} replaceHref="/meetings/new" />
      <AppHeader displayName={session.user.displayName} />
      <section className="content-page narrow-content-page">
        <header className="content-page-header">
          <div>
            <span className="workspace-label">{session.organization.name}</span>
            <h1>새 회의 만들기</h1>
            <p className="muted">회의 정보를 먼저 등록하면 녹음, 최종 전사와 AI 회의록이 하나의 회의로 관리됩니다.</p>
          </div>
          <Link className="button secondary" href="/meetings">목록으로 돌아가기</Link>
        </header>
        {workspace.projects.length > 0 ? (
          <NewMeetingForm projects={workspace.projects} defaultParticipantName={session.user.displayName} />
        ) : (
          <div className="empty-state" role="alert">
            <strong>사용할 수 있는 프로젝트가 없습니다</strong>
            <p>회의는 활성 프로젝트에 등록해야 합니다. 조직 관리자에게 프로젝트 생성을 요청해 주세요.</p>
            <Link className="button secondary" href="/meetings">회의록 목록</Link>
          </div>
        )}
      </section>
    </main>
  );
}
