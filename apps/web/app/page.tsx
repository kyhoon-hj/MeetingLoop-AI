import { ensureQuickCaptureMeeting, getWorkspace } from "@meetingloop/db";
import { loginAction, logoutAction, registerAction } from "./actions";
import RecordingPanel from "./RecordingPanel";
import QueryErrorDialog from "./QueryErrorDialog";
import ValidatedForm from "./ValidatedForm";
import { getSessionPayload } from "./session";

interface ErrorFeedback {
  title: string;
  message: string;
}

function errorFeedback(error: string | undefined): ErrorFeedback | null {
  if (!error) {
    return null;
  }

  const feedbackByCode: Record<string, ErrorFeedback> = {
    login: { title: "로그인 정보를 확인해 주세요", message: "이메일 또는 비밀번호가 올바르지 않습니다." },
    session: { title: "로그인이 만료되었습니다", message: "보안을 위해 세션이 종료되었습니다. 다시 로그인해 주세요." },
    REGISTER_INPUT_INVALID: {
      title: "회원가입 정보를 확인해 주세요",
      message: "이름과 조직명을 입력하고, 올바른 이메일과 8자 이상의 비밀번호를 사용해 주세요. 조직 주소에는 영문 소문자, 숫자, 하이픈(-)만 사용할 수 있습니다."
    },
    PROJECT_INPUT_INVALID: { title: "프로젝트 정보를 확인해 주세요", message: "프로젝트 이름과 키의 형식 또는 입력 길이를 확인해 주세요." },
    MEETING_INPUT_INVALID: { title: "회의 정보를 확인해 주세요", message: "회의 제목, 유형, 참석자, 안건 및 녹음 동의 항목을 확인해 주세요." },
    EMAIL_ALREADY_EXISTS: { title: "이미 가입된 이메일입니다", message: "다른 이메일을 사용하거나 기존 계정으로 로그인해 주세요." },
    ORGANIZATION_SLUG_ALREADY_EXISTS: { title: "이미 사용 중인 조직 주소입니다", message: "조직 주소를 다른 값으로 변경해 주세요. 예: product-team-2" },
    PROJECT_KEY_ALREADY_EXISTS: { title: "이미 사용 중인 프로젝트 키입니다", message: "같은 조직에서 사용하지 않은 다른 프로젝트 키를 입력해 주세요." },
    PROJECT_MANAGE_FORBIDDEN: { title: "프로젝트 관리 권한이 없습니다", message: "조직 관리자 또는 프로젝트 관리자에게 권한을 요청해 주세요." },
    MEETING_CREATE_FORBIDDEN: { title: "회의 생성 권한이 없습니다", message: "조직 관리자, 프로젝트 관리자 또는 편집자 권한이 필요합니다." },
    MEMBERSHIP_INACTIVE: { title: "비활성화된 계정입니다", message: "이 조직을 사용할 수 없습니다. 조직 관리자에게 계정 활성화를 요청해 주세요." },
    PROJECT_NOT_FOUND: { title: "프로젝트를 찾을 수 없습니다", message: "프로젝트가 삭제되었거나 다른 조직의 프로젝트입니다. 목록을 새로고침해 주세요." }
  };
  return feedbackByCode[error] ?? {
    title: "시스템 오류가 발생했습니다",
    message: "입력 내용의 문제가 아니라 서버 처리 중 오류가 발생했습니다. 잠시 후 다시 시도하고, 계속 발생하면 관리자에게 문의해 주세요."
  };
}

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const feedback = errorFeedback(params?.error);
  const sessionPayload = await getSessionPayload();

  if (sessionPayload) {
    await ensureQuickCaptureMeeting(sessionPayload.userId, sessionPayload.organizationId);
  }

  const workspace = sessionPayload ? await getWorkspace(sessionPayload.userId, sessionPayload.organizationId) : null;
  const activeMeeting = workspace?.meetings.at(-1);

  if (!workspace) {
    return (
      <main className="shell auth-shell">
        <QueryErrorDialog feedback={feedback} />
        <section className="auth-panel panel" aria-label="로그인">
          <div className="panel-header">
            <div>
              <h1>MeetingLoop AI</h1>
              <p className="muted">원본 음성은 내 기기에 저장하고, 서버에는 전사 TXT와 최종 회의록만 남깁니다.</p>
            </div>
            <span className="status-pill"><span className="status-dot" aria-hidden="true" />PostgreSQL</span>
          </div>
          <div className="panel-body">
            <ValidatedForm className="form-grid" action={loginAction}>
              <label>
                이메일
                <input name="email" type="email" data-field-label="이메일" defaultValue="admin@example.com" required />
              </label>
              <label>
                비밀번호
                <input name="password" type="password" data-field-label="비밀번호" defaultValue="ChangeMe123!" required />
              </label>
              <button className="button" type="submit">로그인</button>
            </ValidatedForm>
            <div className="demo-accounts">
              <strong>데모 계정</strong>
              <p>admin@example.com / ChangeMe123!</p>
            </div>
            <details className="compact-details">
              <summary>새 조직 만들기</summary>
              <ValidatedForm className="form-grid project-form" action={registerAction}>
                <label>
                  이름
                  <input name="displayName" data-field-label="이름" placeholder="예: 김관리" required maxLength={80} />
                </label>
                <label>
                  이메일
                  <input name="email" type="email" data-field-label="이메일" placeholder="owner@example.com" required />
                </label>
                <label>
                  비밀번호
                  <input name="password" type="password" data-field-label="비밀번호" placeholder="8자 이상" required minLength={8} maxLength={128} />
                </label>
                <label>
                  조직명
                  <input name="organizationName" data-field-label="조직명" placeholder="예: 제품팀" required maxLength={100} />
                </label>
                <label>
                  조직 주소
                  <input name="organizationSlug" data-field-label="조직 주소" data-validation="organization-slug" placeholder="예: product-team" required maxLength={40} />
                </label>
                <button className="button secondary" type="submit">회원가입 및 조직 생성</button>
              </ValidatedForm>
            </details>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <QueryErrorDialog feedback={feedback} />
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
