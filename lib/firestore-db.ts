import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  DocumentData,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";

export type FirestoreDocument = Record<string, any>;

/**
 * Normalizes document data for Firestore storage (handling undefined / NaN / dates).
 */
export function sanitizeForFirestore<T extends Record<string, any>>(data: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    } else if (value instanceof Date) {
      result[key] = value.toISOString();
    } else if (typeof value === "number" && isNaN(value)) {
      result[key] = null;
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeForFirestore(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Universal Firestore CRUD helpers for portal collections.
 */
export const firestoreService = {
  db,

  async get<T = FirestoreDocument>(collectionName: string, id: string | number): Promise<T | null> {
    try {
      const docRef = doc(db, collectionName, String(id));
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return null;
      return { id: snapshot.id, ...snapshot.data() } as unknown as T;
    } catch (error) {
      console.warn(`[Firestore get ${collectionName}/${id}]`, error);
      return null;
    }
  },

  async set(collectionName: string, id: string | number, data: Record<string, any>, merge = true): Promise<boolean> {
    try {
      const docRef = doc(db, collectionName, String(id));
      const clean = sanitizeForFirestore(data);
      await setDoc(docRef, clean, { merge });
      return true;
    } catch (error) {
      console.error(`[Firestore set ${collectionName}/${id}]`, error);
      return false;
    }
  },

  async update(collectionName: string, id: string | number, data: Record<string, any>): Promise<boolean> {
    try {
      const docRef = doc(db, collectionName, String(id));
      const clean = sanitizeForFirestore(data);
      await updateDoc(docRef, clean);
      return true;
    } catch (error) {
      console.error(`[Firestore update ${collectionName}/${id}]`, error);
      return false;
    }
  },

  async delete(collectionName: string, id: string | number): Promise<boolean> {
    try {
      const docRef = doc(db, collectionName, String(id));
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error(`[Firestore delete ${collectionName}/${id}]`, error);
      return false;
    }
  },

  async list<T = FirestoreDocument>(
    collectionName: string,
    options?: {
      whereConstraints?: Array<[string, any, any]>;
      orderField?: string;
      orderDirection?: "asc" | "desc";
      limitCount?: number;
    }
  ): Promise<T[]> {
    try {
      const colRef = collection(db, collectionName);
      const constraints: QueryConstraint[] = [];

      if (options?.whereConstraints) {
        for (const [field, op, val] of options.whereConstraints) {
          constraints.push(where(field, op, val));
        }
      }

      if (options?.orderField) {
        constraints.push(orderBy(options.orderField, options.orderDirection || "asc"));
      }

      if (options?.limitCount) {
        constraints.push(limit(options.limitCount));
      }

      const q = query(colRef, ...constraints);
      const snapshot = await getDocs(q);
      return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as unknown as T[];
    } catch (error) {
      console.warn(`[Firestore list ${collectionName}]`, error);
      return [];
    }
  },

  async listAll<T = FirestoreDocument>(collectionName: string): Promise<T[]> {
    try {
      const colRef = collection(db, collectionName);
      const snapshot = await getDocs(colRef);
      return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as unknown as T[];
    } catch (error) {
      console.warn(`[Firestore listAll ${collectionName}]`, error);
      return [];
    }
  },

  async batchSet(collectionName: string, items: Array<{ id: string | number; data: Record<string, any> }>): Promise<boolean> {
    try {
      const batch = writeBatch(db);
      for (const item of items) {
        const docRef = doc(db, collectionName, String(item.id));
        batch.set(docRef, sanitizeForFirestore(item.data), { merge: true });
      }
      await batch.commit();
      return true;
    } catch (error) {
      console.error(`[Firestore batchSet ${collectionName}]`, error);
      return false;
    }
  },

  async count(collectionName: string, whereConstraints?: Array<[string, any, any]>): Promise<number> {
    try {
      const items = await this.list(collectionName, { whereConstraints });
      return items.length;
    } catch {
      return 0;
    }
  }
};
