import type { BrowserReviewState } from "./browser-review";

const DATABASE_NAME = "meetingloop-review-drafts";
const STORE_NAME = "meeting-review";
const DATABASE_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "meetingId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("REVIEW_DATABASE_OPEN_FAILED"));
  });
}

export async function loadBrowserReviewState(meetingId: string): Promise<BrowserReviewState | null> {
  if (typeof indexedDB === "undefined") return null;
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(meetingId);
      request.onsuccess = () => resolve((request.result as BrowserReviewState | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("REVIEW_DATABASE_READ_FAILED"));
    });
  } finally {
    database.close();
  }
}

export async function saveBrowserReviewState(state: BrowserReviewState): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(state);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("REVIEW_DATABASE_WRITE_FAILED"));
    });
  } finally {
    database.close();
  }
}

export async function deleteBrowserReviewState(meetingId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(meetingId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("REVIEW_DATABASE_DELETE_FAILED"));
    });
  } finally {
    database.close();
  }
}
