import type { EvidenceType } from '../types/worker';

export type QueueEventStatus = 'QUEUED' | 'SYNCING' | 'SYNCED' | 'FAILED';

export interface QueuedEvidenceEvent {
  client_event_id: string; // UUIDv4 generated at capture time
  run_id: string;
  household_id: string;
  evidence_type: EvidenceType;
  captured_at: string; // ISO timestamp of capture
  device_id?: string;
  raw_payload?: Record<string, unknown>;
  status: QueueEventStatus;
  retry_count: number;
  created_at: string;
  last_attempt?: string;
  error_message?: string;
  server_response?: any;
}

const DB_NAME = 'municipal_field_worker_db';
const STORE_NAME = 'offline_event_queue';
const DB_VERSION = 1;

export function openQueueDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in current environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'client_event_id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });
}

function notifyQueueUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline-queue-updated'));
  }
}

export async function enqueueEvidenceEvent(
  params: Omit<QueuedEvidenceEvent, 'client_event_id' | 'status' | 'retry_count' | 'created_at'> & {
    client_event_id?: string;
  }
): Promise<QueuedEvidenceEvent> {
  const db = await openQueueDB();
  const clientEventId = params.client_event_id || (crypto.randomUUID ? crypto.randomUUID() : `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const now = new Date().toISOString();

  const eventItem: QueuedEvidenceEvent = {
    client_event_id: clientEventId,
    run_id: params.run_id,
    household_id: params.household_id,
    evidence_type: params.evidence_type,
    captured_at: params.captured_at,
    device_id: params.device_id,
    raw_payload: params.raw_payload,
    status: 'QUEUED',
    retry_count: 0,
    created_at: now
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(eventItem);

    request.onsuccess = () => {
      notifyQueueUpdated();
      resolve(eventItem);
    };

    request.onerror = () => {
      // If already present, don't overwrite
      reject(request.error || new Error(`Failed to enqueue event ${clientEventId}`));
    };
  });
}

export async function getQueuedEvents(): Promise<QueuedEvidenceEvent[]> {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort in strict FIFO by created_at
      const list = (request.result as QueuedEvidenceEvent[]) || [];
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      resolve(list);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to retrieve queued events'));
    };
  });
}

export async function updateQueuedEventStatus(
  clientEventId: string,
  status: QueueEventStatus,
  extra?: Partial<QueuedEvidenceEvent>
): Promise<void> {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getReq = store.get(clientEventId);

    getReq.onsuccess = () => {
      const item = getReq.result as QueuedEvidenceEvent | undefined;
      if (!item) {
        resolve();
        return;
      }

      const updated: QueuedEvidenceEvent = {
        ...item,
        ...extra,
        status,
        last_attempt: new Date().toISOString(),
        retry_count: status === 'FAILED' ? item.retry_count + 1 : item.retry_count
      };

      const putReq = store.put(updated);
      putReq.onsuccess = () => {
        notifyQueueUpdated();
        resolve();
      };
      putReq.onerror = () => {
        reject(putReq.error || new Error(`Failed to update event ${clientEventId}`));
      };
    };

    getReq.onerror = () => {
      reject(getReq.error || new Error(`Failed to read event ${clientEventId}`));
    };
  });
}

export async function removeQueuedEvent(clientEventId: string): Promise<void> {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const req = store.delete(clientEventId);

    req.onsuccess = () => {
      notifyQueueUpdated();
      resolve();
    };

    req.onerror = () => {
      reject(req.error || new Error(`Failed to delete event ${clientEventId}`));
    };
  });
}

export async function clearSyncedEvents(): Promise<number> {
  const db = await openQueueDB();
  const all = await getQueuedEvents();
  const synced = all.filter((e) => e.status === 'SYNCED');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    for (const item of synced) {
      store.delete(item.client_event_id);
    }

    transaction.oncomplete = () => {
      notifyQueueUpdated();
      resolve(synced.length);
    };

    transaction.onerror = () => {
      reject(transaction.error || new Error('Failed to clear synced events'));
    };
  });
}

export async function getPendingQueueCount(): Promise<number> {
  try {
    const all = await getQueuedEvents();
    return all.filter((e) => e.status === 'QUEUED' || e.status === 'FAILED').length;
  } catch {
    return 0;
  }
}
