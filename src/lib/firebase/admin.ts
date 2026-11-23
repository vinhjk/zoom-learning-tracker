import {
  initializeApp,
  getApps,
  cert,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

let adminApp: App | null = null;
let adminAuthInstance: Auth | null = null;

export function getFirebaseAdmin(): App {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    // Safe placeholder fallback for build-time static evaluation
    adminApp = initializeApp({
      projectId: projectId || 'build-placeholder-project',
      credential: cert({
        projectId: projectId || 'build-placeholder-project',
        clientEmail: clientEmail || 'placeholder@project.iam.gserviceaccount.com',
        privateKey:
          privateKey ||
          '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA04rQvY0vQkP5W...placeholder...\n-----END RSA PRIVATE KEY-----\n',
      } as ServiceAccount),
    });
    return adminApp;
  }

  const serviceAccount: ServiceAccount = {
    projectId,
    clientEmail,
    privateKey,
  };

  adminApp = initializeApp({
    credential: cert(serviceAccount),
  });
  return adminApp;
}

export function getAdminAuth(): Auth {
  if (!adminAuthInstance) {
    adminAuthInstance = getAuth(getFirebaseAdmin());
  }
  return adminAuthInstance;
}

export const adminAuth = new Proxy({} as Auth, {
  get(_target, prop) {
    const auth = getAdminAuth();
    const val = (auth as unknown as Record<string, unknown>)[prop as string];
    if (typeof val === 'function') {
      return (val as (...args: unknown[]) => unknown).bind(auth);
    }
    return val;
  },
});

export { adminApp };

