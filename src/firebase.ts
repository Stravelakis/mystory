import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/documents');

export const googleSignIn = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    return {
      user: result.user,
      accessToken: credential?.accessToken || null,
      email: result.user.email
    };
  } catch (err: any) {
    console.error("Firebase Sign In Error:", err);
    throw err;
  }
};

export const googleSignOut = async () => {
  await signOut(auth);
};
