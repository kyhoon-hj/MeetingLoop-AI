export interface MeetingApiErrorPayload {
  error?: string;
  message?: string;
  currentVersion?: number;
}

export class MeetingApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: MeetingApiErrorPayload,
    public readonly cause?: unknown
  ) {
    super(payload.error ?? (status === 0 ? "NETWORK_ERROR" : "API_REQUEST_FAILED"));
    this.name = "MeetingApiClientError";
  }
}

interface MeetingApiRequestOptions {
  signal?: AbortSignal | undefined;
  retryCount?: number | undefined;
  request?: typeof fetch | undefined;
}

export async function meetingApiRequest<T>(
  input: string,
  init: RequestInit = {},
  options: MeetingApiRequestOptions = {}
): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new MeetingApiClientError(0, { error: "OFFLINE", message: "네트워크 연결 후 다시 시도해 주세요." });
  }
  if (options.signal?.aborted) {
    throw new DOMException("The operation was aborted", "AbortError");
  }
  const request = options.request ?? fetch;
  const retryCount = Math.max(0, options.retryCount ?? 0);
  const headers = new Headers(init.headers);
  const canRetryMutation = !init.method || init.method === "GET" || init.method === "HEAD" || headers.has("Idempotency-Key");
  let attempt = 0;
  while (true) {
    try {
      const requestInit = options.signal ? { ...init, signal: options.signal } : init;
      const response = await request(input, requestInit);
      const payload = await response.json().catch(() => null) as T | MeetingApiErrorPayload | null;
      if (response.ok) return payload as T;
      if (response.status >= 500 && canRetryMutation && attempt < retryCount) {
        attempt += 1;
        continue;
      }
      throw new MeetingApiClientError(response.status, (payload ?? {}) as MeetingApiErrorPayload);
    } catch (error) {
      if (error instanceof MeetingApiClientError || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (canRetryMutation && attempt < retryCount) {
        attempt += 1;
        continue;
      }
      throw new MeetingApiClientError(0, { error: "NETWORK_ERROR" }, error);
    }
  }
}
