'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';
import AppLayout from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sessionUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !sessionUser) {
      router.replace('/');
    }
  }, [loading, sessionUser, router]);

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

  if (!sessionUser) {
    return null;
  }

  return <AppLayout>{children}</AppLayout>;
}

