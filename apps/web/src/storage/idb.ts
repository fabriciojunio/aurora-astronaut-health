// Minimal promise wrapper over IndexedDB, so the app has no storage dependency to audit.

export const DB_NAME = 'aurora'
const DB_VERSION = 1
export const STORES = ['meta', 'records', 'keys'] as const
export type StoreName = (typeof STORES)[number]

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function openDatabase(name: string = DB_NAME): Promise<IDBDatabase> {
  const request = indexedDB.open(name, DB_VERSION)
  request.onupgradeneeded = () => {
    const db = request.result
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
    if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys')
    if (!db.objectStoreNames.contains('records')) {
      const records = db.createObjectStore('records', { keyPath: ['collection', 'id'] })
      records.createIndex('byCollection', 'collection')
    }
  }
  return promisify(request)
}

export async function idbGet<T>(db: IDBDatabase, store: StoreName, key: IDBValidKey) {
  return promisify(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>
}

export async function idbPut(db: IDBDatabase, store: StoreName, value: unknown, key?: IDBValidKey) {
  const tx = db.transaction(store, 'readwrite')
  await promisify(tx.objectStore(store).put(value, key))
}

export async function idbGetAllByIndex<T>(
  db: IDBDatabase,
  store: StoreName,
  index: string,
  query: IDBValidKey,
): Promise<T[]> {
  return promisify(db.transaction(store).objectStore(store).index(index).getAll(query)) as Promise<T[]>
}

export async function idbClear(db: IDBDatabase, store: StoreName) {
  await promisify(db.transaction(store, 'readwrite').objectStore(store).clear())
}

export async function deleteDatabase(name: string = DB_NAME): Promise<void> {
  await promisify(indexedDB.deleteDatabase(name) as IDBRequest<unknown>)
}
