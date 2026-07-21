export type LiveRecognitionErrorCode =
  | "no-speech"
  | "aborted"
  | "audio-capture"
  | "network"
  | "not-allowed"
  | "service-not-allowed"
  | "bad-grammar"
  | "language-not-supported"
  | string;

export interface LiveRecognitionRecoveryPolicy {
  retry: boolean;
  retryDelayMs: number;
  message: string;
}

const maxConnectionRetryCount = 5;

function retryDelay(attempt: number): number {
  return Math.min(10_000, 1_000 * (2 ** Math.max(0, attempt - 1)));
}

export function liveRecognitionRecoveryPolicy(
  error: LiveRecognitionErrorCode,
  attempt: number
): LiveRecognitionRecoveryPolicy {
  if (error === "no-speech") {
    const delay = retryDelay(attempt);
    return {
      retry: true,
      retryDelayMs: delay,
      message: "잠시 말씀이 없어 듣고 있습니다. 말씀을 시작하면 실시간 TXT가 자연스럽게 이어집니다."
    };
  }

  if (error === "aborted") {
    return {
      retry: true,
      retryDelayMs: 500,
      message: "실시간 TXT 연결을 다시 준비하고 있습니다. 녹음은 계속 저장됩니다."
    };
  }

  if (error === "not-allowed" || error === "service-not-allowed") {
    return {
      retry: false,
      retryDelayMs: 0,
      message: "실시간 TXT 권한이 허용되지 않았습니다. 녹음은 계속되며, 브라우저의 마이크·음성인식 권한을 허용한 뒤 녹음을 일시 중지했다가 재개해 주세요."
    };
  }

  if (error === "audio-capture") {
    return {
      retry: false,
      retryDelayMs: 0,
      message: "실시간 TXT용 마이크 연결을 확인하지 못했습니다. 녹음은 계속 저장되며, 입력 장치를 확인한 뒤 녹음을 일시 중지했다가 재개해 주세요."
    };
  }

  if (error === "language-not-supported" || error === "bad-grammar") {
    return {
      retry: false,
      retryDelayMs: 0,
      message: "이 브라우저의 한국어 실시간 TXT를 사용할 수 없습니다. 녹음은 계속 저장되며 문장은 직접 추가할 수 있습니다."
    };
  }

  const delay = retryDelay(attempt);
  if (attempt >= maxConnectionRetryCount) {
    return {
      retry: false,
      retryDelayMs: 0,
      message: "실시간 TXT 연결 재시도를 잠시 멈췄습니다. 녹음은 계속 저장됩니다. 녹음을 일시 중지했다가 재개하면 다시 연결합니다."
    };
  }

  return {
    retry: true,
    retryDelayMs: delay,
    message: `실시간 TXT 연결이 잠시 불안정해 ${Math.ceil(delay / 1_000)}초 후 다시 연결합니다. 녹음은 계속 저장됩니다.`
  };
}
