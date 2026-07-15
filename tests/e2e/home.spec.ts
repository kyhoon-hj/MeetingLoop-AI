import { expect, test } from "@playwright/test";

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

test("preserves rapid speech fragments as separate transcript cards", async ({ page }) => {
  await page.addInitScript(() => {
    class MockMediaRecorder {
      static isTypeSupported() {
        return true;
      }

      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
    }

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      maxAlternatives = 1;
      onresult: ((event: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        window.setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [
              Object.assign([{ transcript: "첫 번째 빠른 문장" }], { isFinal: false }),
              Object.assign([{ transcript: "동시에 들어온 문장" }], { isFinal: false })
            ]
          });
        }, 10);
        window.setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [
              Object.assign([{ transcript: "첫 번째 빠른 문장 다음 화자 문장" }], { isFinal: true }),
              Object.assign([{ transcript: "동시에 들어온 문장" }], { isFinal: false })
            ]
          });
        }, 1050);
      }

      stop() {}
    }

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: MockMediaRecorder
    });
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: MockSpeechRecognition
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({ getTracks: () => [] })
      }
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.getByRole("button", { name: "녹음 시작" }).click();

  const transcriptFields = page.getByRole("textbox", { name: /^전사 문장/ });
  await expect(transcriptFields).toHaveCount(3);
  expect(await transcriptFields.evaluateAll((elements) => (
    elements.map((element) => (element as HTMLTextAreaElement).value)
  ))).toEqual([
    "다음 화자 문장",
    "동시에 들어온 문장",
    "첫 번째 빠른 문장"
  ]);
  await page.getByRole("button", { name: "종료" }).click();
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

  await page.getByText("참여자 설정", { exact: true }).click();
  await page.getByLabel("참여자 수").selectOption("3");
  await expect(page.getByLabel("참여자 3 이름")).toBeVisible();
  await page.getByLabel("참여자 1 이름").fill("김대리");
  await page.getByLabel("참여자 2 이름").fill("이과장");
  await expect(page.getByRole("button", { name: "김대리", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "문장 추가" }).click();
  await expect(page.getByLabel("화자 이름 1")).toHaveValue("김대리");
  await page.getByLabel("화자 이름 1").fill("김팀장");
  await expect(page.getByRole("button", { name: "김팀장", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("textbox", { name: "전사 문장 1" }).fill("회의 녹음 후 전사 TXT만 서버에 저장하고 최종 회의록 기록을 남긴다.");
  await page.getByRole("button", { name: "전사 저장" }).click();
  await expect(page.getByRole("region", { name: "실시간 전사 편집" })).toContainText("전사 문장 1개를 회의에 저장했습니다.");

  const reportTab = page.getByRole("tab", { name: "회의록·보고서" });
  if (await reportTab.isVisible()) {
    await reportTab.click();
  }
  await expect(page.getByRole("group", { name: "AI 분석 방식" })).toBeVisible();
  await expect(page.getByRole("button", { name: "로컬 무료 AI" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "AI 보고서 생성" }).click();
  const report = page.getByRole("region", { name: "AI 분석 보고서" });
  await expect(report).toContainText("테스트 분석기 (deterministic-test)가 전사 TXT를 분석해 보고서를 생성했습니다.");
  await expect(report).toContainText("현재 화면 TXT 1개를 사용했습니다.");
  await expect(report.getByRole("textbox", { name: "요약", exact: true })).toHaveValue(/회의 녹음 후 전사 TXT만 서버에 저장/);
  await report.getByRole("textbox", { name: "제목", exact: true }).fill("수정된 최종 회의록");
  await report.getByRole("textbox", { name: "리스크", exact: true }).fill("원본 음성은 로컬 저장 후 삭제 여부를 확인해야 한다.");
  await page.getByRole("button", { name: "최종 서버 저장 기록 남기기" }).click();
  await expect(report).toContainText("최종 서버 저장 기록을 남겼습니다.");
});

test("registers a new organization into the same recording-first workbench", async ({ page }, testInfo) => {
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
  await expect(page.getByRole("heading", { name: "녹음 회의록" })).toBeVisible();
  await expect(page.getByText("회의 준비")).toHaveCount(0);
});
