import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  onSnapshot,
  serverTimestamp,
  DocumentData,
  QueryConstraint,
  Unsubscribe,
} from '../firebase/firestore';
import { getFirestoreDb } from '../firebase/firestore';
import { RepositoryError } from '@spartan-g/shared-types';

export abstract class BaseRepository<T extends DocumentData> {
  constructor(protected readonly collectionName: string) {}

  protected getCollectionRef() {
    return collection(getFirestoreDb(), this.collectionName);
  }

  protected getDocRef(id: string) {
    return doc(getFirestoreDb(), this.collectionName, id);
  }

  async getById(id: string): Promise<(T & { id: string }) | null> {
    try {
      const snapshot = await getDoc(this.getDocRef(id));
      if (!snapshot.exists()) return null;
      return { id: snapshot.id, ...(snapshot.data() as T) };
    } catch (error) {
      throw new RepositoryError(`Failed to get ${this.collectionName}/${id}`, 'repo/get', error);
    }
  }

  async getAll(constraints: QueryConstraint[] = []): Promise<(T & { id: string })[]> {
    try {
      const q = constraints.length
        ? query(this.getCollectionRef(), ...constraints)
        : query(this.getCollectionRef());
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
    } catch (error: any) {
      const message = error?.message || 'Unknown error';
      throw new Error(`Failed to list ${this.collectionName}: ${message}`);
    }
  }

  async create(id: string, data: T): Promise<void> {
    try {
      await setDoc(this.getDocRef(id), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw new RepositoryError(`Failed to create ${this.collectionName}/${id}`, 'repo/create', error);
    }
  }

  async update(id: string, data: Partial<T>): Promise<void> {
    try {
      await updateDoc(this.getDocRef(id), {
        ...data,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw new RepositoryError(`Failed to update ${this.collectionName}/${id}`, 'repo/update', error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await deleteDoc(this.getDocRef(id));
    } catch (error) {
      throw new RepositoryError(`Failed to delete ${this.collectionName}/${id}`, 'repo/delete', error);
    }
  }

  subscribe(
    id: string,
    callback: (data: (T & { id: string }) | null) => void,
  ): Unsubscribe {
    return onSnapshot(
      this.getDocRef(id),
      (snapshot) => {
        if (!snapshot.exists()) {
          callback(null);
          return;
        }
        callback({ id: snapshot.id, ...(snapshot.data() as T) });
      },
      (error) => {
        throw new RepositoryError(`Subscription error on ${this.collectionName}/${id}`, 'repo/subscribe', error);
      },
    );
  }

  subscribeQuery(
    constraints: QueryConstraint[],
    callback: (data: (T & { id: string })[]) => void,
  ): Unsubscribe {
    const q = query(this.getCollectionRef(), ...constraints);
    return onSnapshot(
      q,
      (snapshot) => {
        callback(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as T) })));
      },
      (error) => {
        throw new RepositoryError(`Query subscription error on ${this.collectionName}`, 'repo/subscribe-query', error);
      },
    );
  }
}
