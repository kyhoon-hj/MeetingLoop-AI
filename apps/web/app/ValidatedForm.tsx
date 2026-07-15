"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useState } from "react";
import FeedbackDialog from "./FeedbackDialog";

type ValidatedFormProps = Omit<ComponentPropsWithoutRef<"form">, "onSubmit">;

function validationMessage(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const label = field.dataset.fieldLabel ?? field.name ?? "입력값";
  if (field.validity.valueMissing) {
    const requiredMessages: Record<string, string> = {
      이름: "이름을 입력해 주세요.",
      이메일: "이메일 주소를 입력해 주세요.",
      비밀번호: "비밀번호를 입력해 주세요.",
      조직명: "조직명을 입력해 주세요.",
      "조직 주소": "조직 주소를 입력해 주세요. 예: product-team"
    };
    return requiredMessages[label] ?? `${label} 항목을 입력해 주세요.`;
  }
  if (field.validity.typeMismatch && field.type === "email") {
    return "이메일 주소 형식이 올바르지 않습니다. 예: user@example.com";
  }
  if (field.validity.typeMismatch) return `${label} 형식이 올바르지 않습니다.`;
  if (field.validity.tooShort) return `${label}은 최소 ${field.getAttribute("minlength")}자 이상 입력해 주세요.`;
  if (field.validity.tooLong) return `${label}이 허용된 최대 길이를 초과했습니다.`;
  return `${label} 항목의 입력값을 확인해 주세요.`;
}

function organizationSlugError(form: HTMLFormElement): { field: HTMLInputElement; message: string } | null {
  const field = form.querySelector<HTMLInputElement>('input[data-validation="organization-slug"]');
  if (!field || !field.value || /^[a-z0-9][a-z0-9-]*$/.test(field.value)) return null;
  return {
    field,
    message: "조직 주소는 영문 소문자(a-z), 숫자(0-9), 하이픈(-)만 사용할 수 있으며 첫 글자는 영문 소문자 또는 숫자여야 합니다. 예: product-team"
  };
}

export default function ValidatedForm({ children, ...props }: ValidatedFormProps) {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <>
      <form
        {...props}
        noValidate
        onSubmit={(event) => {
          const form = event.currentTarget;
          if (!form.checkValidity()) {
            event.preventDefault();
            const invalid = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(":invalid");
            if (!invalid) return;
            setMessage(validationMessage(invalid));
            window.requestAnimationFrame(() => invalid.focus());
            return;
          }

          const slugError = organizationSlugError(form);
          if (!slugError) return;
          event.preventDefault();
          setMessage(slugError.message);
          window.requestAnimationFrame(() => slugError.field.focus());
        }}
      >
        {children}
      </form>
      <FeedbackDialog
        open={message !== null}
        title="입력 내용을 확인해 주세요"
        message={message ?? ""}
        tone="warning"
        onClose={() => setMessage(null)}
      />
    </>
  );
}
