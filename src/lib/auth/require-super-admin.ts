import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase/admin';
import { NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = '__session';
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();

export interface AuthenticatedUser {
  uid: string;
  email: string;
  name: string | undefined;
  picture: string | undefined;
}

export interface AuthResult {
  user: AuthenticatedUser | null;
  error: NextResponse | null;
}

/**
 * Verifies the Firebase session cookie and checks SUPER_ADMIN authorization.
 * Must be called in every protected API route before accessing business data.
 *
 * Returns { user, error }.
 * If error is not null, return it immediately from the route handler.
 */
export async function requireSuperAdmin(): Promise<AuthResult> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return {
        user: null,
        error: NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'No session found' },
          { status: 401 }
        ),
      };
    }

    // Verify the session cookie with Firebase Admin
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);

    // Check email exists and is verified
    if (!decodedClaims.email || !decodedClaims.email_verified) {
      return {
        user: null,
        error: NextResponse.json(
          { error: 'ACCESS_DENIED', message: 'Email not verified' },
          { status: 403 }
        ),
      };
    }

    // Normalize and compare email
    const userEmail = decodedClaims.email.trim().toLowerCase();

    if (userEmail !== SUPER_ADMIN_EMAIL) {
      return {
        user: null,
        error: NextResponse.json(
          { error: 'ACCESS_DENIED', message: 'You do not have access to this application' },
          { status: 403 }
        ),
      };
    }

    return {
      user: {
        uid: decodedClaims.uid,
        email: userEmail,
        name: decodedClaims.name,
        picture: decodedClaims.picture,
      },
      error: null,
    };
  } catch (error) {
    console.error('Auth verification failed:', error);
    return {
      user: null,
      error: NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Session invalid or expired' },
        { status: 401 }
      ),
    };
  }
}

export { SESSION_COOKIE_NAME };

