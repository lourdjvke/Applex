import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getDatabase, ref, get, set, push, update, remove, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyC7-EUXcFtcJ803tRoh4zFDDCAQWKkXSaQ",
  authDomain: "gemmai.firebaseapp.com",
  databaseURL: "https://gemmai-default-rtdb.firebaseio.com",
  projectId: "gemmai",
  storageBucket: "gemmai.firebasestorage.app",
  messagingSenderId: "555487686207",
  appId: "1:555487686207:web:81a273f95a669d0f25128a",
  measurementId: "G-1DLY94SWKB"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

// Generic Database helpers
export async function dbGet<T>(path: string): Promise<T | null> {
  const snap = await get(ref(db, path));
  return snap.exists() ? (snap.val() as T) : null;
}

export async function dbSet<T>(path: string, data: T): Promise<void> {
  await set(ref(db, path), data);
}

export async function dbPush<T>(path: string, data: T): Promise<string> {
  const newRef = push(ref(db, path));
  await set(newRef, data);
  return newRef.key!;
}

export async function dbUpdate(path: string, data: Record<string, any>): Promise<void> {
  await update(ref(db, path), data);
}

export async function dbRemove(path: string): Promise<void> {
  await remove(ref(db, path));
}
