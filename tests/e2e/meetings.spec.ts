import { expect, test } from "@playwright/test";
import { Client } from "pg";
import {
  closeDatabasePool,
  createMeeting,
  createProject,
  registerOrganization,
  saveMinutes,
  saveTranscript
} from "../../packages/db/src";

test("lists meetings, pages results, opens detail, and shows controlled read errors", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const initialContentReadFailures: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400 && /\/api\/meetings\/[^/]+\/(transcript|minutes)$/.test(new URL(response.url()).pathname)) {
      initialContentReadFailures.push(`${response.status()} ${response.url()}`);
    }
  });
  const suffix = `${testInfo.project.name.slice(0, 3)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`.toLowerCase();
  const email = `stage6-screen-${suffix}@example.com`;
  const organizationSlug = `stage6-screen-${suffix}`;
  const password = "Stage6ScreenPassword!";
  const owner = await registerOrganization({
    email, password, displayName: "화면 검증 관리자", organizationName: "단계 6 화면 조직", organizationSlug, timezone: "Asia/Seoul"
  });

  try {
    const project = await createProject(owner.user.id, {
      organizationId: owner.organization.id, name: "화면 테스트 프로젝트", key: "SCREEN", description: "단계 6 E2E"
    });
    for (let index = 1; index <= 10; index += 1) {
      await createMeeting(owner.user.id, {
        organizationId: owner.organization.id, projectId: project.id, title: `페이지 목록 회의 ${index}`,
        meetingType: "GENERAL", participants: [{ displayName: `목록 참석자 ${index}`, roleLabel: "검증", organizationLabel: "QA" }],
        agendas: [{ title: `목록 안건 ${index}`, summary: "cursor 화면 검증" }], consentConfirmed: true,
        fixtureFileName: "local-only.wav", fixtureMimeType: "audio/wav", fixtureSizeBytes: 128
      });
    }
    const target = await createMeeting(owner.user.id, {
      organizationId: owner.organization.id, projectId: project.id, title: "단계 6 화면 검증 회의",
      meetingType: "REQUIREMENTS", participants: [{ displayName: "김화면", roleLabel: "기획", organizationLabel: "제품팀" }],
      agendas: [{ title: "목록과 상세 화면 검증", summary: "성공 및 실패 화면을 확인합니다." }], consentConfirmed: true,
      fixtureFileName: "local-only.wav", fixtureMimeType: "audio/wav", fixtureSizeBytes: 128
    });
    await saveTranscript(owner.user.id, {
      organizationId: owner.organization.id, meetingId: target.meeting.id, version: 0,
      segments: [{ sequence: 0, speakerLabel: "김화면", startMs: 0, endMs: 4000, editedText: "목록과 상세 화면 테스트를 진행합니다.", source: "MANUAL" }]
    });
    await saveTranscript(owner.user.id, {
      organizationId: owner.organization.id, meetingId: target.meeting.id, version: 1,
      segments: [{ sequence: 0, speakerLabel: "김화면", startMs: 0, endMs: 4000, editedText: "수정된 최종 전사로 상세 화면을 검증합니다.", source: "MANUAL" }]
    });
    const minutes = {
      title: "단계 6 최종 회의록", summary: "회의 목록과 상세 화면을 실제 브라우저에서 검증했습니다.",
      keyPoints: ["cursor 페이지네이션 확인"], discussionTopics: ["상세 조회 구성"], decisions: ["실패 화면도 함께 검증"],
      actionItems: [{ id: "action-screen", content: "모바일과 데스크톱 화면을 확인한다.", assignee: "김화면", dueDate: null, evidenceSegmentSequence: 0 }],
      risks: [], openQuestions: []
    };
    await saveMinutes(owner.user.id, {
      organizationId: owner.organization.id, meetingId: target.meeting.id, version: 0, ...minutes
    });
    await saveMinutes(owner.user.id, {
      organizationId: owner.organization.id, meetingId: target.meeting.id, version: 1,
      ...minutes, summary: "수정된 최종 회의록으로 상세 화면과 revision을 검증했습니다."
    });

    await page.goto("/");
    const loginPanel = page.getByRole("region", { name: "로그인" });
    await loginPanel.locator('input[name="email"]').first().fill(email);
    await loginPanel.locator('input[name="password"]').first().fill(password);
    await loginPanel.getByRole("button", { name: "로그인" }).click();
    await expect(page.getByRole("heading", { name: "녹음 회의록" })).toBeVisible();
    await page.getByRole("link", { name: "새 회의", exact: true }).click();
    await expect(page.getByRole("heading", { name: "새 회의 만들기" })).toBeVisible();
    await page.getByLabel("프로젝트").selectOption(project.id);
    await page.getByLabel("회의 유형").selectOption("WEEKLY");
    await page.getByLabel("회의 제목").fill("사용자가 만든 신규 화면 회의");
    await page.getByLabel("참석자 1 이름").fill("이신규");
    await page.getByLabel("안건 1 제목").fill("신규 회의 작성 흐름 확인");
    await page.getByRole("button", { name: "참석자 추가" }).click();
    await page.getByLabel("참석자 2 이름").fill("박추가");
    await page.getByRole("button", { name: "안건 추가" }).click();
    await page.getByLabel("안건 2 제목").fill("검색 기능 확인");
    await page.getByLabel("녹음 동의 확인").check();
    await page.getByRole("button", { name: "회의 만들고 녹음 시작" }).click();
    await expect(page).toHaveURL(/meetingId=.*created=1/);
    await expect(page.locator(".success-banner")).toContainText("새 회의를 만들었습니다");
    await expect(page.getByText("사용자가 만든 신규 화면 회의", { exact: true })).toBeVisible();
    await expect.poll(() => initialContentReadFailures).toEqual([]);
    await page.getByRole("link", { name: "회의록 목록" }).click();

    await expect(page).toHaveURL(/\/meetings$/);
    await expect(page.getByRole("heading", { name: "회의록 목록" })).toBeVisible();
    await page.getByPlaceholder("회의 제목, 참석자, 최종 전사와 회의록 검색").fill("사용자가 만든 신규 화면 회의");
    await page.getByRole("button", { name: "검색", exact: true }).click();
    await expect(page.locator(".search-result-summary")).toContainText("1개의 회의를 찾았습니다");
    await expect(page.getByText("사용자가 만든 신규 화면 회의", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "초기화" }).click();
    const targetCard = page.locator(".meeting-list-card").filter({ hasText: "단계 6 화면 검증 회의" });
    await expect(targetCard).toContainText("화면 테스트 프로젝트");
    await expect(targetCard).toContainText("김화면");
    await expect(targetCard).toContainText("전사 확정 v2");
    await expect(targetCard).toContainText("회의록 확정 v2");
    await expect(page.getByRole("link", { name: "다음 페이지" })).toBeVisible();

    await page.getByPlaceholder("회의 제목, 참석자, 최종 전사와 회의록 검색").fill("수정된 최종 전사");
    await page.getByRole("button", { name: "검색", exact: true }).click();
    await expect(page.getByText("단계 6 화면 검증 회의", { exact: true })).toBeVisible();
    await expect(page.locator(".search-result-summary")).toContainText("1개의 회의를 찾았습니다");
    await page.getByRole("link", { name: "초기화" }).click();

    await page.getByText("상세 필터").click();
    await page.getByLabel("프로젝트").selectOption(project.id);
    await page.getByLabel("최종 전사").selectOption("CONFIRMED");
    await page.getByLabel("최종 회의록").selectOption("CONFIRMED");
    await page.getByRole("button", { name: "필터 적용" }).click();
    await expect(page).toHaveURL(/projectId=/);
    await expect(page).toHaveURL(/transcriptStatus=CONFIRMED/);
    await expect(page.getByText("단계 6 화면 검증 회의", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "초기화" }).click();

    await page.getByRole("link", { name: "다음 페이지" }).click();
    await expect(page).toHaveURL(/cursor=/);
    await expect(page.getByText("페이지 목록 회의 1", { exact: true })).toBeVisible();
    await expect(page.getByText("단계 6 화면 검증 회의", { exact: true })).toHaveCount(0);

    await page.goto("/meetings");
    await page.locator(".meeting-list-card").filter({ hasText: "단계 6 화면 검증 회의" })
      .getByRole("link", { name: "상세 조회" }).click();
    await expect(page).toHaveURL(new RegExp(`/meetings/${target.meeting.id}$`));
    await expect(page.getByRole("heading", { name: "단계 6 화면 검증 회의" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "참석자" })).toBeVisible();
    await expect(page.getByText("김화면", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "안건" })).toBeVisible();
    await expect(page.getByText("수정된 최종 전사로 상세 화면을 검증합니다.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "단계 6 최종 회의록" })).toBeVisible();
    await expect(page.getByText("최종 전사 v1", { exact: true })).toBeVisible();
    await expect(page.getByText("최종 회의록 v1", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "AI 재생성" }).click();
    await expect(page).toHaveURL(new RegExp(`meetingId=${target.meeting.id}.*view=minutes`));
    await expect(page.getByRole("region", { name: "AI 분석 보고서" })).toBeVisible();

    await page.goto("/meetings?cursor=invalid-cursor");
    const invalidCursorAlert = page.locator(".empty-state[role='alert']");
    await expect(invalidCursorAlert).toContainText("페이지 정보를 확인할 수 없습니다");
    await expect(invalidCursorAlert).toContainText("첫 페이지부터 다시 조회해 주세요");

    await page.goto("/meetings/meeting-does-not-exist");
    const notFoundAlert = page.locator(".empty-state[role='alert']");
    await expect(notFoundAlert).toContainText("회의를 찾을 수 없습니다");
    await expect(notFoundAlert).toContainText("현재 조직에서 접근할 수 없는 회의입니다");
  } finally {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(`DELETE FROM organizations WHERE id = $1`, [owner.organization.id]);
      await client.query(`DELETE FROM users WHERE id = $1`, [owner.user.id]);
    } finally {
      await client.end();
      await closeDatabasePool();
    }
  }
});
