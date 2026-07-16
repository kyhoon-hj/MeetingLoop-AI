"use client";

import { useState } from "react";

export default function DeleteMeetingButton({ organizationId, meetingId }: { organizationId: string; meetingId: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("회의 ID를 입력해야 삭제 요청을 제출할 수 있습니다.");
  const [submitting, setSubmitting] = useState(false);

  async function requestDeletion() {
    setSubmitting(true);
    try {
      const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const response = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, meetingId, confirmation, idempotencyKey: `meeting-delete-${id}` })
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error === "INVALID_INPUT"
          ? "회의 ID가 일치하지 않습니다. 정확한 ID를 입력해 주세요."
          : "삭제 요청을 처리하지 못했습니다. 권한과 서버 상태를 확인해 주세요.");
        return;
      }
      window.location.assign("/meetings?deleted=1");
    } catch {
      setMessage("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return <button className="button danger" type="button" onClick={() => setOpen(true)}>회의 전체 삭제 요청</button>;
  }
  return (
    <div className="meeting-delete-confirm" role="region" aria-label="회의 전체 삭제 확인">
      <p>전사·회의록·revision을 포함한 회의 전체가 목록에서 즉시 숨겨지고 30일 후 영구 삭제됩니다.</p>
      <label>
        확인을 위해 회의 ID 입력
        <input aria-label="삭제할 회의 ID 확인" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={meetingId} />
      </label>
      <small role="status">{message}</small>
      <div className="toolbar">
        <button className="button secondary" type="button" onClick={() => setOpen(false)} disabled={submitting}>취소</button>
        <button className="button danger" type="button" onClick={() => void requestDeletion()} disabled={submitting || confirmation !== meetingId}>
          {submitting ? "삭제 요청 중" : "30일 후 영구 삭제"}
        </button>
      </div>
    </div>
  );
}
