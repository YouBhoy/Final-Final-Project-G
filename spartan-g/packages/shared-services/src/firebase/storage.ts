import {
  getStorage,
  FirebaseStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

import { getFirebaseApp } from './app';

let storage: FirebaseStorage;

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) {
    storage = getStorage(getFirebaseApp());
  }
  return storage;
}

export { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject };
