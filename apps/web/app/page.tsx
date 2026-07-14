import { canManageProject } from "@meetingloop/auth";
import { getDemoWorkspace } from "@meetingloop/db";
import { archiveProjectAction, createMeetingAction, createProjectAction, loginAction, logoutAction, registerAction, restoreProjectAction, updateProjectAction } from "./actions";
import RecordingPanel from "./RecordingPanel";
import { getSessionPayload } from "./session";

function errorMessage(error: string | undefined): string | null {
  if (!error) {
    return null;
  }

  const messages: Record<string, string> = {
    login: "이메일 또는 비밀번호가 올바르지 않습니다.",
    session: "세션이 만료되었습니다. 다시 로그인해 주세요.",
    PROJECT_MANAGE_FORBIDDEN: "프로젝트를 생성할 권한이 없습니다.",
    PROJECT_KEY_ALREADY_EXISTS: "이미 사용 중인 프로젝트 키입니다.",
    EMAIL_ALREADY_EXISTS: "이미 가입된 이메일입니다.",
    ORGANIZATION_SLUG_ALREADY_EXISTS: "이미 사용 중인 조직 주소입니다.",
    MEETING_CREATE_FORBIDDEN: "회의를 생성할 권한이 없습니다.",
    PROJECT_NOT_FOUND: "프로젝트를 찾을 수 없습니다."
  };
  return messages[error] ?? "요청을 처리하지 못했습니다.";
}

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const error = errorMessage(params?.error);
  const sessionPayload = await getSessionPayload();
  const workspace = sessionPayload ? await getDemoWorkspace(sessionPayload.userId, sessionPayload.organizationId) : null;
  const activeMeeting = workspace?.meetings.at(-1);
  const activeMeetingId = activeMeeting?.meeting.id;
  const canCreateProject = workspace
    ? canManageProject({
      id: workspace.user.id,
      organizationId: workspace.organization.id,
      email: workspace.user.email,
      role: workspace.membership.role
    })
    : false;

  if (!workspace) {
    return (
      <main className="shell auth-shell">
        <section className="auth-panel panel" aria-label="로그인">
          <div className="panel-header">
            <div>
              <h1>MeetingLoop AI</h1>
              <p className="muted">원본 음성은 내 기기에, 전사 TXT와 회의록만 서버에 저장합니다.</p>
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
          <span>{workspace.organization.name} · {workspace.user.displayName}</span>
        </div>
        <form action={logoutAction}>
          <button className="button secondary" type="submit">로그아웃</button>
        </form>
      </header>

      <section className="simple-layout" aria-label="회의록 작업 공간">
        <section className="panel primary-panel">
          <div className="panel-header">
            <div>
              <h1>전사 검토</h1>
              <p className="muted">녹음하고, 전사 TXT를 정리한 뒤 AI 분석 보고서를 생성하세요.</p>
            </div>
          </div>
          <div className="panel-body">
            {activeMeeting ? (
              <div className="current-meeting" role="region" aria-label="현재 회의">
                <strong>{activeMeeting.meeting.title}</strong>
                <span>전사 {activeMeeting.transcriptSegmentCount}개 · 회의록 {activeMeeting.minutes ? "DRAFT" : "없음"}</span>
              </div>
            ) : (
              <div className="current-meeting" role="region" aria-label="현재 회의">
                <strong>아직 회의가 없습니다</strong>
                <span>오른쪽에서 회의를 하나 만든 뒤 전사 TXT를 서버에 저장할 수 있습니다.</span>
              </div>
            )}
            <RecordingPanel meetingId={activeMeetingId} />
          </div>
        </section>

        <aside className="panel setup-panel" id="projects">
          <div className="panel-header">
            <div>
              <h2>회의 준비</h2>
              <p className="muted">프로젝트와 회의만 간단히 정합니다.</p>
            </div>
          </div>
          <div className="panel-body">
            {error ? <p className="alert" role="alert">{error}</p> : null}
            <div className="mini-list" aria-label="프로젝트">
              <strong>프로젝트</strong>
              {workspace.projects.map((project) => (
                <div className="mini-list-row" key={project.id}>
                  <span>{project.name}</span>
                  <small>{project.key}</small>
                </div>
              ))}
            </div>

            {canCreateProject ? (
              <details className="compact-details">
                <summary>프로젝트 만들기</summary>
                <form className="form-grid project-form" action={createProjectAction}>
                  <label>
                    프로젝트 이름
                    <input name="name" placeholder="예: 회의록 자동화" required maxLength={80} />
                  </label>
                  <label>
                    키
                    <input name="key" placeholder="예: MINUTES" required maxLength={16} pattern="[A-Za-z0-9][A-Za-z0-9-]*" />
                  </label>
                  <label>
                    설명
                    <textarea name="description" placeholder="프로젝트 목적" maxLength={500} />
                  </label>
                  <button className="button" type="submit">프로젝트 생성</button>
                </form>
              </details>
            ) : null}

            {workspace.projects.length > 0 ? (
              <form className="form-grid project-form" action={createMeetingAction}>
                <strong>새 회의</strong>
                <label>
                  프로젝트 선택
                  <select name="projectId" required>
                    {workspace.projects.map((project) => (
                      <option value={project.id} key={project.id}>{project.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  회의 제목
                  <input name="title" placeholder="예: 정기 회의" required maxLength={120} />
                </label>
                <label>
                  회의 유형
                  <select name="meetingType" defaultValue="GENERAL">
                    <option value="REQUIREMENTS">요구사항</option>
                    <option value="WEEKLY">주간</option>
                    <option value="DECISION">결정</option>
                    <option value="REVIEW">검토</option>
                    <option value="GENERAL">일반</option>
                  </select>
                </label>
                <label>
                  참석자
                  <textarea name="participants" defaultValue={"김민수 / 백엔드 / 제품팀\n이지윤 / 기획 / 제품팀"} required />
                </label>
                <label>
                  사전 안건
                  <textarea name="agendas" defaultValue={"녹음 동의: 고지 확인\n회의록 생성: 전사 TXT 기반 정리"} required />
                </label>
                <label>
                  fixture 파일명
                  <input name="fixtureFileName" defaultValue="local-only-audio.wav" required maxLength={160} />
                </label>
                <label className="check-row">
                  <input name="consentConfirmed" type="checkbox" required />
                  참석자에게 녹음 사실과 AI 분석 목적을 고지했습니다.
                </label>
                <button className="button" type="submit">회의 생성</button>
              </form>
            ) : null}

            <details className="compact-details">
              <summary>프로젝트 관리</summary>
              <strong>활성 프로젝트</strong>
              <ul className="list">
                {workspace.projects.length > 0 ? workspace.projects.map((project) => (
                  <li key={project.id}>
                    <strong>{project.name}</strong>
                    {canCreateProject ? (
                      <div className="project-actions">
                        <form className="inline-form" action={updateProjectAction}>
                          <input type="hidden" name="projectId" value={project.id} />
                          <label>
                            이름
                            <input name="name" defaultValue={project.name} required maxLength={80} />
                          </label>
                          <label>
                            설명
                            <input name="description" defaultValue={project.description} maxLength={500} />
                          </label>
                          <button className="button secondary" type="submit">수정</button>
                        </form>
                        <form action={archiveProjectAction}>
                          <input type="hidden" name="projectId" value={project.id} />
                          <button className="button danger" type="submit">보관</button>
                        </form>
                      </div>
                    ) : null}
                  </li>
                )) : <li className="muted">활성 프로젝트가 없습니다.</li>}
              </ul>
              <strong>보관된 프로젝트</strong>
              <ul className="list">
                {workspace.archivedProjects.length > 0 ? workspace.archivedProjects.map((project) => (
                  <li key={project.id}>
                    <strong>{project.name}</strong>
                    <span className="status-pill">보관됨</span>
                    {canCreateProject ? (
                      <form action={restoreProjectAction}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <button className="button secondary" type="submit">복원</button>
                      </form>
                    ) : null}
                  </li>
                )) : <li className="muted">보관된 프로젝트가 없습니다.</li>}
              </ul>
            </details>
          </div>
        </aside>
      </section>
    </main>
  );
}
