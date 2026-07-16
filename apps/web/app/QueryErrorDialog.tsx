"use client";

import { useRouter } from "next/navigation";
import FeedbackDialog from "./FeedbackDialog";

export default function QueryErrorDialog({ feedback, replaceHref = "/" }: {
  feedback: { title: string; message: string } | null;
  replaceHref?: string;
}) {
  const router = useRouter();
  return (
    <FeedbackDialog
      open={Boolean(feedback)}
      title={feedback?.title ?? ""}
      message={feedback?.message ?? ""}
      onClose={() => router.replace(replaceHref)}
    />
  );
}
