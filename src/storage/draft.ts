// 草稿持久化 —— 全部走 IndexedDB 单库单记录，容量大（可存 base64 图片），关标签页不丢。
// localStorage 只留给 xhs-style 这类小配置（原有行为不变）。
import type { JSONContent } from '@tiptap/core'
import type { CardMeta } from '@/markdown/types'

const DB_NAME = 'xhs-editor'
const DB_VERSION = 1
const STORE = 'draft'
const KEY = 'current'

export interface Draft {
  version: 1
  savedAt: number
  doc: JSONContent
  meta: CardMeta
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveDraft(draft: Omit<Draft, 'version' | 'savedAt'>): Promise<number> {
  const db = await openDb()
  const record: Draft = { version: 1, savedAt: Date.now(), ...draft }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(record, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return record.savedAt
  } finally {
    db.close()
  }
}

export async function loadDraft(): Promise<Draft | null> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return null
  }
  try {
    return await new Promise<Draft | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as Draft | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  } finally {
    db.close()
  }
}

export async function clearDraft(): Promise<void> {
  try {
    const db = await openDb()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  } catch {
    /* 清空失败不影响新建 */
  }
}
