import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@/firebase/storage';
import { getFirebaseStorage } from '@/firebase/storage';

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  progress: number;
}

class StorageService {
  async uploadFile(
    path: string,
    blob: Blob,
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<string> {
    const storageRef = ref(getFirebaseStorage(), path);
    const task = uploadBytesResumable(storageRef, blob);

    return new Promise((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          onProgress?.({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
            progress: snapshot.bytesTransferred / snapshot.totalBytes,
          });
        },
        reject,
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        },
      );
    });
  }

  async deleteFile(path: string): Promise<void> {
    const storageRef = ref(getFirebaseStorage(), path);
    await deleteObject(storageRef);
  }
}

export const storageService = new StorageService();
