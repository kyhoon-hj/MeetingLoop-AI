import Link from "next/link";
import type { MeetingDetailRecord } from "@meetingloop/db";
import RevisionHistory from "./RevisionHistory";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" })
    .format(new Date(value));
}

function formatTimecode(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export default function MeetingDetail({ detail }: { detail: MeetingDetailRecord }) {
  const editUrl = `/?meetingId=${encodeURIComponent(detail.meeting.id)}`;
  const minutesEditUrl = `${editUrl}&view=minutes`;
  return (
    <div className="meeting-detail">
      <section className="detail-hero">
        <div>
          <span className="workspace-label">{detail.projectName}</span>
          <h1>{detail.meeting.title}</h1>
          <p className="muted">{formatDate(detail.meeting.startedAt)} · {detail.meeting.meetingType} · {detail.meeting.status}</p>
        </div>
        <div className="toolbar">
          <Link className="button secondary" href={editUrl}>전사 및 회의록 편집</Link>
          <Link className="button" href={minutesEditUrl}>AI 재생성</Link>
        </div>
      </section>

      <div className="detail-grid">
        <section className="detail-section" aria-labelledby="participants-heading">
          <h2 id="participants-heading">참석자</h2>
          {detail.participants.length === 0 ? <p className="empty-copy">등록된 참석자가 없습니다.</p> : (
            <ul className="detail-list">
              {detail.participants.map((participant) => (
                <li key={participant.id}><strong>{participant.displayName}</strong><span>{participant.roleLabel || "역할 미지정"} · {participant.organizationLabel || "소속 미지정"}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="detail-section" aria-labelledby="agendas-heading">
          <h2 id="agendas-heading">안건</h2>
          {detail.agendas.length === 0 ? <p className="empty-copy">등록된 안건이 없습니다.</p> : (
            <ol className="detail-list agenda-list">
              {detail.agendas.map((agenda) => (
                <li key={agenda.id}><strong>{agenda.sequence + 1}. {agenda.title}</strong><span>{agenda.summary || "요약 없음"}</span></li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="detail-section" aria-labelledby="transcript-heading">
        <div className="detail-section-heading">
          <h2 id="transcript-heading">최종 전사</h2>
          {detail.transcript ? <span className="content-status complete">확정 v{detail.transcript.version}</span> : null}
        </div>
        {!detail.transcript ? <p className="empty-copy">확정된 전사가 없습니다. 편집 화면에서 최종 전사를 먼저 확정해 주세요.</p> : (
          <div className="transcript-detail-list">
            {detail.transcript.segments.map((segment) => (
              <article key={segment.id}>
                <span>{formatTimecode(segment.startMs)} · {segment.speakerLabel}</span>
                <p>{segment.editedText}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="detail-section" aria-labelledby="minutes-heading">
        <div className="detail-section-heading">
          <h2 id="minutes-heading">최종 회의록</h2>
          {detail.minutes ? <span className="content-status complete">확정 v{detail.minutes.version}</span> : null}
        </div>
        {!detail.minutes ? <p className="empty-copy">확정된 회의록이 없습니다. AI 보고서를 생성하고 최종 확정해 주세요.</p> : (
          <div className="minutes-detail">
            <h3>{detail.minutes.title}</h3>
            <p>{detail.minutes.summary}</p>
            <h4>핵심 내용</h4>
            <ul>{detail.minutes.keyPoints.map((item) => <li key={item}>{item}</li>)}</ul>
            <h4>결정 사항</h4>
            {detail.minutes.decisions.length > 0 ? <ul>{detail.minutes.decisions.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="empty-copy">확정된 결정 사항이 없습니다.</p>}
            <h4>할 일</h4>
            {detail.minutes.actionItems.length > 0 ? <ul>{detail.minutes.actionItems.map((item) => <li key={item.id}>{item.content}{item.assignee ? ` · ${item.assignee}` : ""}</li>)}</ul> : <p className="empty-copy">등록된 할 일이 없습니다.</p>}
          </div>
        )}
      </section>

      <RevisionHistory revisions={detail.revisions} />
    </div>
  );
}
