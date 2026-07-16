interface ErrorWithCode {
  code?: unknown;
  name?: unknown;
  message?: unknown;
}

export function logUnexpectedServerError(context: string, error: unknown): void {
  const value = (typeof error === "object" && error !== null ? error : {}) as ErrorWithCode;
  const databaseCode = typeof value.code === "string" && /^[A-Z0-9_]+$/i.test(value.code) ? value.code : null;
  const applicationCode = typeof value.message === "string" && /^[A-Z0-9_]+$/.test(value.message) ? value.message : null;
  const errorName = typeof value.name === "string" ? value.name : "UnknownError";
  console.error("[server-error]", { context, code: databaseCode ?? applicationCode ?? errorName });
}
