import { expect, test } from "@playwright/test";

test("login and create a project in the simplified workspace", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.getByText("MeetingLoop AI").first()).toBeVisible();
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page.getByRole("heading", { name: "전사 검토" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "회의 준비" })).toBeVisible();
  await expect(page.getByRole("button", { name: "녹음 시작" })).toBeVisible();
  await expect(page.getByRole("region", { name: "브라우저 녹음" })).toContainText("녹음 대기");
  await expect(page.getByRole("button", { name: "일시 중지" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "재개" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "종료" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "로컬 음성 보관 확인" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "로컬 원본 음성 삭제" })).toBeEnabled();
  await page.getByRole("button", { name: "로컬 원본 음성 삭제" }).click();
  await expect(page.getByRole("region", { name: "브라우저 녹음" })).toContainText("원본 음성 청크를 삭제했습니다.");

  await expect(page.getByRole("region", { name: "실시간 전사 편집" })).toBeVisible();
  await page.getByRole("button", { name: "문장 추가" }).click();
  await page.getByRole("textbox", { name: "전사 문장 1" }).fill("고객 가입 흐름에서 본인 인증 문구를 더 명확하게 수정한다.");
  await page.getByRole("button", { name: "전사 저장" }).click();
  await expect(page.getByRole("region", { name: "실시간 전사 편집" })).toContainText("저장됨");
  await page.getByRole("button", { name: "문장 삭제" }).last().click();
  await expect(page.getByText("고객 가입 흐름에서 본인 인증 문구를 더 명확하게 수정한다.")).toHaveCount(0);

  await page.getByText("프로젝트 만들기").click();
  const key = `E2E-${testInfo.project.name.toUpperCase()}-${Date.now().toString().slice(-5)}`;
  await page.getByLabel("프로젝트 이름").fill(`${testInfo.project.name} 검증 프로젝트`);
  await page.getByLabel("키").fill(key);
  await page.getByPlaceholder("프로젝트 목적").fill("Playwright가 생성한 검증 프로젝트");
  await page.getByRole("button", { name: "프로젝트 생성" }).click();
  await expect(page.locator(".mini-list-row").filter({ hasText: `${testInfo.project.name} 검증 프로젝트` })).toBeVisible();

  await page.getByLabel("회의 제목").fill(`${testInfo.project.name} fixture 회의`);
  await page.getByRole("textbox", { name: "참석자" }).fill("김민수 / 백엔드 / 제품팀\n이지윤 / 기획 / 제품팀");
  await page.getByRole("textbox", { name: "사전 안건" }).fill("녹음 동의: 고지 확인\n회의록 생성: 전사 TXT 기반 정리");
  await page.getByLabel("fixture 파일명").fill(`${testInfo.project.name}-fixture.wav`);
  await page.getByLabel("참석자에게 녹음 사실과 AI 분석 목적을 고지했습니다.").check();
  await page.getByRole("button", { name: "회의 생성" }).click();

  await expect(page.getByRole("region", { name: "현재 회의" })).toContainText(`${testInfo.project.name} fixture 회의`);
  await page.getByRole("button", { name: "문장 추가" }).click();
  await page.getByRole("textbox", { name: "전사 문장 1" }).fill("회의 생성 후 저장되는 전사 문장입니다.");
  await page.getByRole("button", { name: "전사 저장" }).click();
  await expect(page.getByRole("region", { name: "실시간 전사 편집" })).toContainText("전사 문장 1개를 회의에 저장했습니다.");
  await page.getByRole("button", { name: "AI 분석 보고서 생성" }).click();
  await expect(page.getByRole("region", { name: "AI 분석 보고서" })).toContainText("AI 분석 보고서를 서버에 저장했습니다.");
  await expect(page.getByRole("region", { name: "AI 분석 보고서" })).toContainText("회의 생성 후 저장되는 전사 문장입니다.");
  await expect(page.getByRole("region", { name: "AI 분석 보고서" })).toContainText("주요 논의");
  await expect(page.getByRole("region", { name: "AI 분석 보고서" })).toContainText("리스크");
  await expect(page.getByRole("region", { name: "AI 분석 보고서" })).toContainText("미결 질문");
});

test("registers a new organization and can update then archive a project", async ({ page }, testInfo) => {
  await page.goto("/");

  await page.getByText("새 조직 만들기").click();
  const suffix = `${testInfo.project.name}-${Date.now().toString().slice(-6)}`.toLowerCase();
  await page.getByLabel("이름").fill("신규 관리자");
  await page.getByLabel("이메일").last().fill(`owner-${suffix}@example.com`);
  await page.getByLabel("비밀번호").last().fill("ChangeMe123!");
  await page.getByLabel("조직명").fill(`${testInfo.project.name} 조직`);
  await page.getByLabel("조직 주소").fill(`org-${suffix}`);
  await page.getByRole("button", { name: "회원가입 및 조직 생성" }).click();

  await expect(page.getByText(`${testInfo.project.name} 조직`)).toBeVisible();
  await page.getByText("프로젝트 만들기").click();

  const key = `ORG-${testInfo.project.name.toUpperCase()}-${Date.now().toString().slice(-4)}`;
  await page.getByLabel("프로젝트 이름").fill("가입 조직 프로젝트");
  await page.getByLabel("키").fill(key);
  await page.getByLabel("설명").fill("새 조직에서 만든 프로젝트");
  await page.getByRole("button", { name: "프로젝트 생성" }).click();
  await expect(page.locator(".mini-list-row").filter({ hasText: "가입 조직 프로젝트" })).toBeVisible();

  await page.getByText("프로젝트 관리").click();
  const projectCard = page.locator("li").filter({ hasText: "가입 조직 프로젝트" });
  await projectCard.getByLabel("이름").fill("수정된 가입 조직 프로젝트");
  await projectCard.getByLabel("설명").fill("수정된 설명");
  await projectCard.getByRole("button", { name: "수정" }).click();
  await expect(page.locator(".mini-list-row").filter({ hasText: "수정된 가입 조직 프로젝트" })).toBeVisible();

  await page.getByText("프로젝트 관리").click();
  const updatedCard = page.locator("li").filter({ hasText: "수정된 가입 조직 프로젝트" });
  await updatedCard.getByRole("button", { name: "보관" }).click();
  await expect(page.locator(".mini-list-row").filter({ hasText: "수정된 가입 조직 프로젝트" })).toHaveCount(0);
  await expect(page.getByText("보관된 프로젝트")).toBeVisible();
  const archivedCard = page.locator("li").filter({ hasText: "수정된 가입 조직 프로젝트" });
  await expect(archivedCard).toContainText("보관됨");
  await archivedCard.getByRole("button", { name: "복원" }).click();
  await expect(page.locator(".mini-list-row").filter({ hasText: "수정된 가입 조직 프로젝트" })).toBeVisible();
});
