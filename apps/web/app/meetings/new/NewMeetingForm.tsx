"use client";

import { useState } from "react";
import type { Project } from "@meetingloop/domain";
import { createMeetingAction } from "../../actions";
import ValidatedForm from "../../ValidatedForm";

interface EditableRow {
  id: number;
}

export default function NewMeetingForm({ projects, defaultParticipantName }: {
  projects: Project[];
  defaultParticipantName: string;
}) {
  const [participants, setParticipants] = useState<EditableRow[]>([{ id: 1 }]);
  const [agendas, setAgendas] = useState<EditableRow[]>([{ id: 1 }]);
  const [nextId, setNextId] = useState(2);

  const addRow = (kind: "participant" | "agenda") => {
    const row = { id: nextId };
    setNextId((value) => value + 1);
    if (kind === "participant") setParticipants((items) => [...items, row]);
    else setAgendas((items) => [...items, row]);
  };

  return (
    <ValidatedForm className="meeting-create-form" action={createMeetingAction}>
      <section className="form-section">
        <div className="form-section-heading">
          <span>1</span><div><h2>회의 기본정보</h2><p>목록에서 회의를 쉽게 찾을 수 있도록 작성해 주세요.</p></div>
        </div>
        <div className="form-grid two-column-form">
          <label>
            프로젝트
            <select name="projectId" data-field-label="프로젝트" required defaultValue={projects[0]?.id ?? ""}>
              <option value="" disabled>프로젝트 선택</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label>
            회의 유형
            <select name="meetingType" data-field-label="회의 유형" defaultValue="GENERAL" required>
              <option value="GENERAL">일반 회의</option>
              <option value="WEEKLY">주간 회의</option>
              <option value="REQUIREMENTS">요구사항 회의</option>
              <option value="DECISION">의사결정 회의</option>
              <option value="REVIEW">검토 회의</option>
            </select>
          </label>
          <label className="full-width">
            회의 제목
            <input name="title" data-field-label="회의 제목" placeholder="예: 3분기 제품 출시 일정 회의" required maxLength={120} autoFocus />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading with-action">
          <span>2</span><div><h2>참석자</h2><p>이름은 필수이며 역할과 소속은 선택 사항입니다.</p></div>
          <button className="button secondary" type="button" onClick={() => addRow("participant")}>참석자 추가</button>
        </div>
        <div className="repeatable-list">
          {participants.map((participant, index) => (
            <div className="repeatable-row participant-row" key={participant.id}>
              <label><span>이름</span><input name="participantName" aria-label={`참석자 ${index + 1} 이름`} data-field-label={`참석자 ${index + 1} 이름`} defaultValue={index === 0 ? defaultParticipantName : ""} required maxLength={80} /></label>
              <label><span>역할</span><input name="participantRole" aria-label={`참석자 ${index + 1} 역할`} placeholder="예: 진행자" maxLength={80} /></label>
              <label><span>소속</span><input name="participantOrganization" aria-label={`참석자 ${index + 1} 소속`} placeholder="예: 제품팀" maxLength={80} /></label>
              {participants.length > 1 ? <button className="icon-button delete-segment-button" type="button" aria-label={`참석자 ${index + 1} 삭제`} onClick={() => setParticipants((items) => items.filter((item) => item.id !== participant.id))}>×</button> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading with-action">
          <span>3</span><div><h2>안건</h2><p>회의에서 다룰 내용을 한 개 이상 등록해 주세요.</p></div>
          <button className="button secondary" type="button" onClick={() => addRow("agenda")}>안건 추가</button>
        </div>
        <div className="repeatable-list">
          {agendas.map((agenda, index) => (
            <div className="repeatable-row agenda-row" key={agenda.id}>
              <label><span>안건 제목</span><input name="agendaTitle" aria-label={`안건 ${index + 1} 제목`} data-field-label={`안건 ${index + 1} 제목`} placeholder="예: 출시 일정 확정" required maxLength={120} /></label>
              <label><span>설명</span><input name="agendaSummary" aria-label={`안건 ${index + 1} 설명`} placeholder="논의할 내용을 간단히 입력" maxLength={500} /></label>
              {agendas.length > 1 ? <button className="icon-button delete-segment-button" type="button" aria-label={`안건 ${index + 1} 삭제`} onClick={() => setAgendas((items) => items.filter((item) => item.id !== agenda.id))}>×</button> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="form-section consent-section">
        <div className="form-section-heading">
          <span>4</span><div><h2>녹음 및 저장 정책 확인</h2><p>원본 음성은 서버로 전송하지 않고 사용자의 기기에만 보관합니다.</p></div>
        </div>
        <label className="check-row">
          <input name="consentConfirmed" type="checkbox" aria-label="녹음 동의 확인" data-field-label="녹음 동의 확인" required />
          <span>모든 참석자에게 녹음 사실과 최종 전사가 외부 AI로 전송될 수 있음을 안내했으며 동의를 확인했습니다.</span>
        </label>
      </section>

      <div className="form-actions sticky-form-actions">
        <a className="button secondary mobile-link" href="/meetings">취소</a>
        <button className="button" type="submit">회의 만들고 녹음 시작</button>
      </div>
    </ValidatedForm>
  );
}
