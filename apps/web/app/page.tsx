import { ensureDemoQuickCaptureMeeting, getDemoWorkspace } from "@meetingloop/db";
import { loginAction, logoutAction, registerAction } from "./actions";
import RecordingPanel from "./RecordingPanel";
import { getSessionPayload } from "./session";

function errorMessage(error: string | undefined): string | null {
  if (!error) {
    return null;
  }

  const messages: Record<string, string> = {
    login: "이메일 또는 비밀번호가 올바르지 않습니다.",
    session: "세션이 만료되었습니다. 다시 로그인해 주세요.",
    EMAIL_ALREADY_EXISTS: "이미 가입된 이메일입니다.",
    ORGANIZATION_SLUG_ALREADY_EXISTS: "이미 사용 중인 조직 주소입니다.",
    MEETING_CREATE_FORBIDDEN: "회의를 생성할 권한이 없습니다."
  };
  return messages[error] ?? "요청을 처리하지 못했습니다.";
}

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const error = errorMessage(params?.error);
  const sessionPayload = await getSessionPayload();

  if (sessionPayload) {
    await ensureDemoQuickCaptureMeeting(sessionPayload.userId, sessionPayload.role, sessionPayload.organizationId);
  }

  const workspace = sessionPayload ? await getDemoWorkspace(sessionPayload.userId, sessionPayload.organizationId) : null;
  const activeMeeting = workspace?.meetings.at(-1);

  if (!workspace) {
    return (
      <main className="shell auth-shell">
        <section className="auth-panel panel" aria-label="로그인">
          <div className="panel-header">
            <div>
              <h1>MeetingLoop AI</h1>
              <p className="muted">원본 음성은 내 기기에 저장하고, 서버에는 전사 TXT와 최종 회의록만 남깁니다.</p>
            </div>
            <span className="status-pill"><span className="status-dot" aria-hidden="true" />Demo</span>
          </div>
          <div className="panel-body">
            {error ? <p className="alert" role="alert">{error}</p> : null}
            <form className="form-grid" action={loginAction}>
              <label>
                이메일
                <input name="email" type="email" defaultValue="admin@example.com" required />
              </label>
              <label>
                비밀번호
                <input name="password" type="password" defaultValue="ChangeMe123!" required />
              </label>
              <button className="button" type="submit">로그인</button>
            </form>
            <div className="demo-accounts">
              <strong>데모 계정</strong>
              <p>admin@example.com / ChangeMe123!</p>
            </div>
            <details className="compact-details">
              <summary>새 조직 만들기</summary>
              <form className="form-grid project-form" action={registerAction}>
                <label>
                  이름
                  <input name="displayName" placeholder="예: 김관리" required maxLength={80} />
                </label>
                <label>
                  이메일
                  <input name="email" type="email" placeholder="owner@example.com" required />
                </label>
                <label>
                  비밀번호
                  <input name="password" type="password" placeholder="8자 이상" required minLength={8} maxLength={128} />
                </label>
                <label>
                  조직명
                  <input name="organizationName" placeholder="예: 제품팀" required maxLength={100} />
                </label>
                <label>
                  조직 주소
                  <input name="organizationSlug" placeholder="예: product-team" required maxLength={40} pattern="[a-z0-9][a-z0-9-]*" />
                </label>
                <button className="button secondary" type="submit">회원가입 및 조직 생성</button>
              </form>
            </details>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>MeetingLoop AI</strong>
          <span>{workspace.user.displayName}</span>
        </div>
        <form action={logoutAction}>
          <button className="button secondary" type="submit">로그아웃</button>
        </form>
      </header>

      <section className="panel primary-panel full-workbench" aria-label="녹음 회의록 작업대">
        <div className="panel-header">
          <div>
            <span className="workspace-label">{workspace.organization.name}</span>
            <h1>녹음 회의록</h1>
            <p className="muted">녹음 종료 후 파일은 내 PC에 저장하고, 수정한 전사 TXT와 최종 AI 분석 보고서만 서버에 기록합니다.</p>
          </div>
        </div>
        <div className="panel-body">
          {activeMeeting ? (
            <div className="current-meeting" role="region" aria-label="현재 기록">
              <strong>{activeMeeting.meeting.title}</strong>
              <span>전사 {activeMeeting.transcriptSegmentCount}개 · 최종 기록 {activeMeeting.minutes?.status === "CONFIRMED" ? "저장됨" : "대기"}</span>
            </div>
          ) : null}
          <RecordingPanel meetingId={activeMeeting?.meeting.id} />
        </div>
      </section>
    </main>
  );
}
