import { createHash, createHmac } from "node:crypto";

export interface StorageObjectRef {
  bucket: string;
  key: string;
}

export interface UploadChunkInput {
  organizationId: string;
  meetingId: string;
  recordingId: string;
  chunkId: string;
  partNumber: number;
  sizeBytes: number;
  mimeType: string;
  body?: ArrayBuffer;
}

export interface UploadedChunk {
  bucket: string;
  key: string;
  partNumber: number;
  sizeBytes: number;
  uploadedAt: string;
}

export interface CreateSignedUrlInput extends StorageObjectRef {
  expiresInSeconds: number;
}

export interface RecordingChunkStorageAdapter {
  uploadChunk(input: UploadChunkInput): Promise<UploadedChunk>;
  createSignedGetUrl(input: CreateSignedUrlInput): Promise<string>;
}

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export function createRecordingStorageKey(input: { organizationId: string; meetingId: string; recordingId: string; extension: string }): string {
  const safeExtension = input.extension.replace(/^\./, "").toLowerCase();
  return `${input.organizationId}/meetings/${input.meetingId}/recordings/${input.recordingId}.${safeExtension}`;
}

export function createRecordingChunkStorageKey(input: UploadChunkInput): string {
  return `${input.organizationId}/meetings/${input.meetingId}/recordings/${input.recordingId}/chunks/${input.partNumber}-${input.chunkId}`;
}

function encodeS3Path(value: string): string {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function toDateStamp(date: Date): string {
  return toAmzDate(date).slice(0, 8);
}

function sha256Hex(value: string | Uint8Array | ArrayBuffer): string {
  const data = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Uint8Array | string, value: string): Uint8Array {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Uint8Array | string, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getSigningKey(config: S3StorageConfig, dateStamp: string): Uint8Array {
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function getObjectUrl(config: S3StorageConfig, bucket: string, key: string): URL {
  const endpoint = new URL(config.endpoint);
  if (config.forcePathStyle ?? true) {
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${bucket}/${encodeS3Path(key)}`;
    return endpoint;
  }

  endpoint.hostname = `${bucket}.${endpoint.hostname}`;
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${encodeS3Path(key)}`;
  return endpoint;
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export class MemoryChunkStorageAdapter implements RecordingChunkStorageAdapter {
  private readonly uploadedChunks = new Map<string, UploadedChunk>();

  async uploadChunk(input: UploadChunkInput): Promise<UploadedChunk> {
    const key = createRecordingChunkStorageKey(input);
    const uploaded: UploadedChunk = {
      bucket: process.env.S3_BUCKET ?? "meetingloop",
      key,
      partNumber: input.partNumber,
      sizeBytes: input.sizeBytes,
      uploadedAt: new Date().toISOString()
    };
    this.uploadedChunks.set(key, uploaded);
    return uploaded;
  }

  async createSignedGetUrl(input: CreateSignedUrlInput): Promise<string> {
    const url = new URL(`memory://${input.bucket}/${input.key}`);
    url.searchParams.set("expires", String(input.expiresInSeconds));
    return url.toString();
  }

  getUploadedChunks(): UploadedChunk[] {
    return [...this.uploadedChunks.values()];
  }
}

export class S3CompatibleStorageAdapter implements RecordingChunkStorageAdapter {
  constructor(private readonly config: S3StorageConfig) {}

  async uploadChunk(input: UploadChunkInput): Promise<UploadedChunk> {
    const key = createRecordingChunkStorageKey(input);
    const body = input.body ?? new ArrayBuffer(0);
    const url = getObjectUrl(this.config, this.config.bucket, key);
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = toDateStamp(now);
    const payloadHash = sha256Hex(body);
    const host = url.host;
    const canonicalHeaders = [
      `content-type:${input.mimeType}`,
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`
    ].join("\n") + "\n";
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = ["PUT", url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
    const signature = hmacHex(getSigningKey(this.config, dateStamp), stringToSign);

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        "Content-Type": input.mimeType,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate
      },
      body
    });

    if (!response.ok) {
      throw new Error(`S3 chunk upload failed with status ${response.status}`);
    }

    return {
      bucket: this.config.bucket,
      key,
      partNumber: input.partNumber,
      sizeBytes: input.sizeBytes,
      uploadedAt: now.toISOString()
    };
  }

  async createSignedGetUrl(input: CreateSignedUrlInput): Promise<string> {
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = toDateStamp(now);
    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const url = getObjectUrl(this.config, input.bucket, input.key);
    url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
    url.searchParams.set("X-Amz-Credential", `${this.config.accessKeyId}/${credentialScope}`);
    url.searchParams.set("X-Amz-Date", amzDate);
    url.searchParams.set("X-Amz-Expires", String(input.expiresInSeconds));
    url.searchParams.set("X-Amz-SignedHeaders", "host");

    const canonicalRequest = [
      "GET",
      url.pathname,
      canonicalQuery(url.searchParams),
      `host:${url.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD"
    ].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
    const signature = hmacHex(getSigningKey(this.config, dateStamp), stringToSign);
    url.searchParams.set("X-Amz-Signature", signature);
    return url.toString();
  }
}

export function createStorageAdapterFromEnv(env: NodeJS.ProcessEnv = process.env): RecordingChunkStorageAdapter {
  if (env.STORAGE_DRIVER === "s3") {
    return new S3CompatibleStorageAdapter({
      endpoint: env.S3_ENDPOINT ?? "http://localhost:9000",
      region: env.S3_REGION ?? "local",
      bucket: env.S3_BUCKET ?? "meetingloop",
      accessKeyId: env.S3_ACCESS_KEY ?? "meetingloop",
      secretAccessKey: env.S3_SECRET_KEY ?? "meetingloop-secret",
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false"
    });
  }

  return new MemoryChunkStorageAdapter();
}
