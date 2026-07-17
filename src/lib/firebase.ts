// Firebase client singletons (web SDK). Config values are the app's
// PUBLIC web keys — safe to commit by design; all protection lives in
// firestore.rules. Lazily initialized so merely importing this module
// during prerender/static export never touches the network.
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBRJS4nWcPyVD97gQXm9G9yWFhMfxAK7E0",
  authDomain: "option-porfolio.firebaseapp.com",
  projectId: "option-porfolio",
  storageBucket: "option-porfolio.firebasestorage.app",
  messagingSenderId: "415983407037",
  appId: "1:415983407037:web:e8dd5f4b2ebf1037fe4cd4",
};

export function firebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}

export function firebaseDb(): Firestore {
  return getFirestore(firebaseApp());
}
