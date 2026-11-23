'use client';

import { Button, Typography, Alert, Space } from 'antd';
import { GoogleOutlined } from '@ant-design/icons';
import { useAuth } from '@/hooks/useAuth';

const { Title, Text } = Typography;

export default function GoogleLoginButton() {
  const { signInWithGoogle, loading, error } = useAuth();

  return (
    <Space direction="vertical" align="center" size="large" style={{ width: '100%' }}>
      <Title level={2} style={{ marginBottom: 0, color: '#1677ff' }}>
        Zoom Learning Tracker
      </Title>
      <Text type="secondary">Hệ thống quản lý học tập qua Zoom</Text>

      {error && (
        <Alert
          message="Lỗi đăng nhập"
          description={error}
          type="error"
          showIcon
          closable
          style={{ maxWidth: 400, width: '100%' }}
        />
      )}

      <Button
        type="primary"
        icon={<GoogleOutlined />}
        size="large"
        loading={loading}
        onClick={signInWithGoogle}
        style={{
          height: 48,
          fontSize: 16,
          paddingInline: 32,
        }}
      >
        Đăng nhập bằng Google
      </Button>
    </Space>
  );
}

