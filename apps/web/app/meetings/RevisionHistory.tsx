import type { MeetingRevisionSummary } from "@meetingloop/db";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Seoul" })
    .format(new Date(value));
}

export default function RevisionHistory({ revisions }: { revisions: MeetingRevisionSummary[] }) {
  return (
    <section className="detail-section" aria-labelledby="revision-heading">
      <h2 id="revision-heading">수정 이력</h2>
      {revisions.length === 0 ? (
        <p className="empty-copy">아직 이전 버전이 없습니다. 전사나 회의록을 재수정하면 이력이 생성됩니다.</p>
      ) : (
        <ol className="revision-list">
          {revisions.map((revision) => (
            <li key={revision.id}>
              <strong>{revision.contentType === "TRANSCRIPT" ? "최종 전사" : "최종 회의록"} v{revision.version}</strong>
              <span>{revision.changedByName} · {formatDate(revision.createdAt)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
