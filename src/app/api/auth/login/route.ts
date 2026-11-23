import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME } from '@/lib/auth/require-super-admin';

const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
// Session cookie expiration: 5 days
const SESSION_EXPIRATION_MS = 5 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const { idToken } = await request.json();

    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'ID token is required' },
        { status: 400 }
      );
    }

    // Verify the ID token
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    // Check email exists and is verified
    if (!decodedToken.email || !decodedToken.email_verified) {
      return NextResponse.json(
        { error: 'ACCESS_DENIED', message: 'Email is not verified' },
        { status: 403 }
      );
    }

    // Normalize and check super admin
    const userEmail = decodedToken.email.trim().toLowerCase();
    if (userEmail !== SUPER_ADMIN_EMAIL) {
      return NextResponse.json(
        { error: 'ACCESS_DENIED', message: 'Bạn không có quyền truy cập ứng dụng này' },
        { status: 403 }
      );
    }

    // Create a session cookie
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRATION_MS,
    });

    const response = NextResponse.json({
      data: {
        email: userEmail,
        name: decodedToken.name,
        picture: decodedToken.picture,
      },
    });

    // Set secure HttpOnly cookie
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_EXPIRATION_MS / 1000,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'AUTH_ERROR', message: 'Authentication failed' },
      { status: 401 }
    );
  }
}

