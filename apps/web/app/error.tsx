"use client";

import FeedbackDialog from "./FeedbackDialog";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="shell auth-shell">
      <FeedbackDialog
        open
        title="시스템 오류가 발생했습니다"
        message="화면을 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요."
        onClose={reset}
      />
    </main>
  );
}
