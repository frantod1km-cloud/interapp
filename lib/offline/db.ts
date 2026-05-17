// Wrapper minimalista de IndexedDB sin dependencias.
//
// Stores:
//   - snapshot: padrón de residentes + autorizaciones vigentes (una sola row,
//     key fija "current")
//   - queue: cola de eventos pendientes de subir cuando vuelva Internet

const DB_NAME = "interapp";
const DB_VERSION = 1;
const SNAPSHOT_STORE = "snapshot";
const QUEUE_STORE = "queue";

export type SnapshotResident = {
  id: string;
  dni: string;
  first_name: string;
  last_name: string;
  unit: string | null;
  kind: string;
};

export type SnapshotAuthorization = {
  id: string;
  dni: string;
  visitor_name: string | null;
  resident_id: string;
  resident_name: string | null;
  valid_until: string; // ISO
};

export type SnapshotVehicle = {
  plate: string;
  make: string | null;
  model: string | null;
  color: string | null;
  resident_id: string;
};

export type SnapshotRule = {
  kind: string;
  weekday_mask: number;
  start_hour: number;
  end_hour: number;
  enabled: boolean;
};

export type Snapshot = {
  fetched_at: string;
  organization_id: string;
  residents: SnapshotResident[];
  authorizations: SnapshotAuthorization[];
  vehicles: SnapshotVehicle[];
  rules: SnapshotRule[];
};

export type QueuedEvent = {
  client_id: string;          // UUID generado en el cliente, idempotencia
  dni: string;
  full_name: string | null;
  direction: "in" | "out";
  result: "authorized" | "denied" | "forced" | "manual";
  reason: string | null;
  authorization_id: string | null;
  resident_id: string | null;
  occurred_at: string;        // ISO local
  gate_id: string | null;
  gate_label: string | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE);
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "client_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const req = fn(s);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

// --- snapshot ---

export async function saveSnapshot(snap: Snapshot): Promise<void> {
  await tx<IDBValidKey>(SNAPSHOT_STORE, "readwrite", (s) => s.put(snap, "current"));
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  const result = await tx<Snapshot | undefined>(SNAPSHOT_STORE, "readonly", (s) =>
    s.get("current") as IDBRequest<Snapshot | undefined>,
  );
  return result ?? null;
}

// --- queue ---

export async function enqueue(event: QueuedEvent): Promise<void> {
  await tx<IDBValidKey>(QUEUE_STORE, "readwrite", (s) => s.put(event));
}

export async function listQueue(): Promise<QueuedEvent[]> {
  const result = await tx<QueuedEvent[]>(QUEUE_STORE, "readonly", (s) => s.getAll() as IDBRequest<QueuedEvent[]>);
  return result ?? [];
}

export async function removeFromQueue(clientId: string): Promise<void> {
  await tx<undefined>(QUEUE_STORE, "readwrite", (s) => s.delete(clientId) as IDBRequest<undefined>);
}
