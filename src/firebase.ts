import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { 
  getDatabase, 
  ref, 
  set, 
  onValue, 
  get,
  query,
  orderByChild,
  limitToLast
} from 'firebase/database';

// Use environment variables for Firebase config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSy_YOUR_API_KEY_HERE",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "your-app.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://your-app-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "your-app",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "your-app.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
const provider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};

export const loginWithEmail = async (email: string, pass: string) => {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  return result.user;
};

export const registerWithEmail = async (email: string, pass: string) => {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  return result.user;
};

export const loginAsGuest = async () => {
  const result = await signInAnonymously(auth);
  return result.user;
};

export const listenToAuthStatus = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

export const updatePlayerStats = async (uid: string, displayName: string, stats: { kills?: number, deaths?: number, playTime?: number }) => {
  const playerRef = ref(db, `leaderboard/${uid}`);
  
  try {
    const snapshot = await get(playerRef);
    const currentData = snapshot.exists() ? snapshot.val() : { kills: 0, deaths: 0, playTime: 0, displayName };
    
    await set(playerRef, {
      displayName: displayName || currentData.displayName || "Unknown Soldier",
      kills: currentData.kills + (stats.kills || 0),
      deaths: currentData.deaths + (stats.deaths || 0),
      playTime: currentData.playTime + (stats.playTime || 0),
      lastActive: Date.now()
    });
  } catch (err) {
    console.error("Failed to update stats", err);
  }
};

export const listenToLeaderboard = (sortBy: 'kills' | 'playTime', callback: (data: any[]) => void) => {
  const leaderboardRef = query(ref(db, 'leaderboard'), orderByChild(sortBy), limitToLast(20));
  
  return onValue(leaderboardRef, (snapshot) => {
    const data: any[] = [];
    snapshot.forEach((childSnapshot) => {
      data.push({
        uid: childSnapshot.key,
        ...childSnapshot.val()
      });
    });
    // Firebase returns ascending, so we reverse it for top players
    callback(data.reverse());
  });
};
