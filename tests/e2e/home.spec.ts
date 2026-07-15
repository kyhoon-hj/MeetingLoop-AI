import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

async function deleteRegisteredTestAccount(email: string, organizationSlug: string): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM organizations WHERE slug = $1`, [organizationSlug]);
    await client.query(`DELETE FROM users WHERE email = $1`, [email]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function waitForTranscriptState(page: Page) {
  const editor = page.getByRole("region", { name: "실시간 전사 편집" });
  await expect(editor.getByText(/서버 v\d+|서버 저장 전/)).toBeVisible();
  return editor;
}

async function clearTranscriptEditor(page: Page) {
  const editor = await waitForTranscriptState(page);
  const deleteButtons = editor.locator(".delete-segment-button");
  const count = await deleteButtons.count();
  for (let index = 0; index < count; index += 1) {
    await deleteButtons.first().click();
  }
  await expect(editor.locator("textarea")).toHaveCount(0);
  return editor;
}

test("shows a recoverable state while microphone permission is pending", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: class MockMediaRecorder {
        static isTypeSupported() {
          return true;
        }
      }
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => new Promise(() => undefined)
      }
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.getByRole("button", { name: "녹음 시작" }).click();

  const recorder = page.getByRole("region", { name: "브라우저 녹음" });
  await expect(recorder).toContainText("마이크 권한 확인 중");
  await expect(recorder).toContainText("브라우저의 마이크 권한 창에서 허용을 눌러주세요.");
  await page.getByRole("button", { name: "권한 요청 취소" }).click();
  await expect(recorder).toContainText("마이크 권한 요청을 취소했습니다.");
  await expect(page.getByRole("button", { name: "녹음 시작" })).toBeEnabled();
});

test("records transcript text and finalizes an AI report in the simplified workbench", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("MeetingLoop AI").first()).toBeVisible();
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page.getByRole("heading", { name: "녹음 회의록" })).toBeVisible();
  await expect(page.getByText("회의 준비")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "브라우저 녹음" })).toContainText("녹음 대기");
  await expect(page.getByRole("button", { name: "녹음 시작" })).toBeVisible();
  await expect(page.getByRole("button", { name: "일시 중지" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "재개" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "종료" })).toBeDisabled();
  await page.getByText("로컬 음성 관리", { exact: true }).click();
  await expect(page.getByRole("button", { name: "로컬 음성 보관 확인" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "로컬 원본 음성 삭제" })).toBeEnabled();

  const transcriptEditor = await clearTranscriptEditor(page);
  await page.getByRole("button", { name: "문장 추가" }).click();
  await page.getByRole("textbox", { name: "전사 문장 1" }).fill("회의 녹음 후 전사 TXT만 서버에 저장하고 최종 회의록 기록을 남긴다.");
  await page.getByRole("button", { name: "최종 전사 확정" }).click();
  await expect(transcriptEditor).toContainText(/최종 전사 1개 문장을 v\d+으로 서버에 확정 저장했습니다./);
  const saveCompleteDialog = page.getByRole("alertdialog");
  await expect(saveCompleteDialog).toContainText("최종 전사 저장 완료");
  await expect(saveCompleteDialog).toContainText(/최종 전사 1개 문장을 v\d+으로 서버에 확정 저장했습니다./);
  await saveCompleteDialog.getByRole("button", { name: "확인" }).click();
  await expect(page.getByRole("button", { name: "TXT 다운로드" })).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "TXT 다운로드" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/transcript-v\d+\.txt$/);

  const reportTab = page.getByRole("tab", { name: "회의록·보고서" });
  const report = page.getByRole("region", { name: "AI 분석 보고서" });
  if (!(await report.isVisible())) await reportTab.click();
  await expect(page.getByRole("group", { name: "AI 분석 방식" })).toBeVisible();
  await expect(page.getByRole("button", { name: "로컬 무료 AI" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "AI 보고서 생성" }).click();
  await expect(report).toContainText("테스트 분석기 (deterministic-test)가 전사 TXT를 분석해 보고서를 생성했습니다.");
  await expect(report.getByRole("textbox", { name: "요약", exact: true })).toHaveValue(/회의 녹음 후 전사 TXT만 서버에 저장/);
  await report.getByRole("textbox", { name: "제목", exact: true }).fill("수정된 최종 회의록");
  await report.getByRole("textbox", { name: "리스크", exact: true }).fill("원본 음성은 로컬 저장 후 삭제 여부를 확인해야 한다.");
  await page.getByRole("button", { name: "회의록 최종 확정" }).click();
  await expect(report).toContainText(/회의록을 v\d+으로 최종 확정했습니다./);
  const minutesCompleteDialog = page.getByRole("alertdialog");
  await expect(minutesCompleteDialog).toContainText("회의록 저장 완료");
  await expect(minutesCompleteDialog).toContainText(/회의록을 v\d+으로 최종 확정했습니다./);
  await minutesCompleteDialog.getByRole("button", { name: "확인" }).click();
});

test("registers a new organization into the same recording-first workbench", async ({ page }, testInfo) => {
  await page.goto("/");

  await page.getByText("새 조직 만들기").click();
  const suffix = `${testInfo.project.name}-${Date.now().toString().slice(-6)}`.toLowerCase();
  const email = `e2e-owner-${suffix}@example.com`;
  const organizationSlug = `e2e-org-${suffix}`;
  try {
    await page.getByLabel("이름").fill("신규 관리자");
    await page.getByLabel("이메일").last().fill(email);
    await page.getByLabel("비밀번호").last().fill("ChangeMe123!");
    await page.getByLabel("조직명").fill(`${testInfo.project.name} 조직`);
    await page.getByLabel("조직 주소").fill(organizationSlug);
    await page.getByRole("button", { name: "회원가입 및 조직 생성" }).click();

    await expect(page.getByText(`${testInfo.project.name} 조직`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "녹음 회의록" })).toBeVisible();
    await expect(page.getByText("회의 준비")).toHaveCount(0);
    await waitForTranscriptState(page);
  } finally {
    await deleteRegisteredTestAccount(email, organizationSlug);
  }
});

test("shows invalid user input in the common feedback dialog", async ({ page }) => {
  await page.goto("/");
  await page.getByText("새 조직 만들기").click();
  await page.getByRole("button", { name: "회원가입 및 조직 생성" }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("입력 내용을 확인해 주세요");
  await expect(dialog).toContainText("이름을 입력해 주세요.");
  await dialog.getByRole("button", { name: "확인" }).click();
  await expect(dialog).toBeHidden();

  await page.getByLabel("이름").fill("입력 검증 사용자");
  await page.getByLabel("이메일").last().fill("validation@example.com");
  await page.getByLabel("비밀번호").last().fill("ChangeMe123!");
  await page.getByLabel("조직명").fill("입력 검증 조직");
  await page.getByLabel("조직 주소").fill("Invalid_slug");
  await page.getByRole("button", { name: "회원가입 및 조직 생성" }).click();
  await expect(dialog).toContainText("영문 소문자(a-z), 숫자(0-9), 하이픈(-)만 사용할 수 있으며 첫 글자는 영문 소문자 또는 숫자여야 합니다.");
});

test("shows a specific message for server action errors", async ({ page }) => {
  await page.goto("/?error=login");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("로그인 정보를 확인해 주세요");
  await expect(dialog).toContainText("이메일 또는 비밀번호가 올바르지 않습니다.");
  await expect(dialog).not.toContainText("요청을 처리하지 못했습니다");
});

test("shows actionable transcript validation failures", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "로그인" }).click();
  const editor = await clearTranscriptEditor(page);

  await page.getByRole("button", { name: "최종 전사 확정" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("저장할 전사 문장이 없습니다");
  await dialog.getByRole("button", { name: "확인" }).click();

  await page.getByRole("button", { name: "문장 추가" }).click();
  await editor.getByRole("textbox", { name: "전사 문장 1" }).fill("가".repeat(4001));
  await page.getByRole("button", { name: "최종 전사 확정" }).click();
  await expect(dialog).toContainText("전사 문장 하나는 최대 4,000자까지 입력할 수 있습니다.");
});

test("shows a version conflict without overwriting local edits", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "로그인" }).click();
  const editor = await clearTranscriptEditor(page);
  await page.getByRole("button", { name: "문장 추가" }).click();
  await editor.getByRole("textbox", { name: "전사 문장 1" }).fill("충돌 시 보존할 로컬 수정 내용");
  await expect(editor.getByRole("textbox", { name: "전사 문장 1" })).toHaveValue("충돌 시 보존할 로컬 수정 내용");

  await page.route("**/api/meetings/*/transcript", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "TRANSCRIPT_VERSION_CONFLICT", currentVersion: 99 })
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "최종 전사 확정" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("다른 수정 내용이 먼저 저장되었습니다");
  await expect(dialog).toContainText("서버 저장본을 다시 불러온 뒤 수정 내용을 다시 반영해 주세요.");
  await expect(editor.getByRole("textbox", { name: "전사 문장 1" })).toHaveValue("충돌 시 보존할 로컬 수정 내용");
});

test("shows actionable minutes generation and version conflict errors", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("heading", { name: "녹음 회의록" })).toBeVisible();
  const reportTab = page.getByRole("tab", { name: "회의록·보고서" });
  const report = page.getByRole("region", { name: "AI 분석 보고서" });
  if (!(await report.isVisible())) await reportTab.click();
  await expect(report.getByText(/서버 v\d+|서버 저장 전/)).toBeVisible();

  await page.route("**/api/meetings/*/minutes/generate", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "TRANSCRIPT_REQUIRED" })
    });
  });
  await report.getByRole("button", { name: "AI 보고서 생성" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("최종 전사가 필요합니다");
  await expect(dialog).toContainText("확정된 전사 TXT가 필요합니다");
  await dialog.getByRole("button", { name: "확인" }).click();
  await page.unroute("**/api/meetings/*/minutes/generate");

  const title = report.getByRole("textbox", { name: "제목", exact: true });
  await title.fill("충돌 시 유지할 회의록 제목");
  await page.route("**/api/meetings/*/minutes", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "MINUTES_VERSION_CONFLICT", currentVersion: 99 })
      });
      return;
    }
    await route.continue();
  });
  await report.getByRole("button", { name: "회의록 최종 확정" }).click();
  await expect(dialog).toContainText("다른 수정 내용이 먼저 저장되었습니다");
  await expect(dialog).toContainText("다른 사용자가 먼저 회의록을 수정했습니다");
  await expect(title).toHaveValue("충돌 시 유지할 회의록 제목");
});
