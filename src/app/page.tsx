'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Spin } from 'antd';
import GoogleLoginButton from '@/components/auth/GoogleLoginButton';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { sessionUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (sessionUser) {
      router.replace('/dashboard');
    }
  }, [sessionUser, router]);

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (sessionUser) {
    return null;
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card
        style={{
          width: 420,
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          borderRadius: 16,
        }}
        styles={{ body: { padding: '48px 32px' } }}
      >
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1677ff, #4096ff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: 32,
              color: '#fff',
              fontWeight: 'bold',
            }}
          >
            ZLT
          </div>
        </div>
        <GoogleLoginButton />
      </Card>
    </div>
  );
}
