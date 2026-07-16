export type ProviderMode = "demo" | "real";

export interface ProviderCapability {
  readonly id: string;
  readonly mode: ProviderMode;
  readonly requiresAudioUpload: boolean;
  readonly supportsServerPersistence: boolean;
  readonly acceptsConfirmedText: boolean;
  readonly externalTransmission: boolean;
}

export interface ProviderExecutionPolicy {
  readonly allowDemo: boolean;
  readonly allowAudioUpload: boolean;
  readonly allowServerPersistence: boolean;
}

export const browserDeterministicCapability = (id: string): ProviderCapability => ({
  id,
  mode: "demo",
  requiresAudioUpload: false,
  supportsServerPersistence: false,
  acceptsConfirmedText: false,
  externalTransmission: false
});

export const confirmedTextProviderCapability = (
  id: string,
  mode: ProviderMode,
  options: { externalTransmission?: boolean } = {}
): ProviderCapability => ({
  id,
  mode,
  requiresAudioUpload: false,
  supportsServerPersistence: true,
  acceptsConfirmedText: true,
  externalTransmission: options.externalTransmission ?? false
});

export function assertProviderExecutionAllowed(
  capability: ProviderCapability,
  policy: ProviderExecutionPolicy
): void {
  if (capability.mode === "demo" && !policy.allowDemo) throw new Error("DEMO_PROVIDER_NOT_ALLOWED");
  if (capability.requiresAudioUpload && !policy.allowAudioUpload) throw new Error("AUDIO_UPLOAD_NOT_ALLOWED");
  if (capability.supportsServerPersistence && !policy.allowServerPersistence) {
    throw new Error("SERVER_PERSISTENCE_NOT_ALLOWED");
  }
}

export const stage1ServerPolicy: ProviderExecutionPolicy = {
  allowDemo: false,
  allowAudioUpload: false,
  allowServerPersistence: true
};

export const stage1BrowserDemoPolicy: ProviderExecutionPolicy = {
  allowDemo: true,
  allowAudioUpload: false,
  allowServerPersistence: false
};
