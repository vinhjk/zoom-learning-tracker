'use client';

import { useState, type ReactNode } from 'react';
import { Layout, Menu, Button, Avatar, Dropdown, Typography, theme } from 'antd';
import {
  DashboardOutlined,
  BookOutlined,
  CalendarOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  BarChartOutlined,
  ApiOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Tổng quan' },
  { key: '/programs', icon: <BookOutlined />, label: 'Chương trình' },
  { key: '/sessions', icon: <CalendarOutlined />, label: 'Buổi học' },
  { key: '/participants', icon: <TeamOutlined />, label: 'Học viên' },
  { key: '/attendance', icon: <CheckCircleOutlined />, label: 'Điểm danh' },
  { key: '/reports', icon: <BarChartOutlined />, label: 'Báo cáo' },
  { key: '/webhooks', icon: <ApiOutlined />, label: 'Webhook' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { sessionUser, signOut } = useAuth();
  const { token } = theme.useToken();

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: sessionUser?.email || '',
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      danger: true,
      onClick: signOut,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken)}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Text
            strong
            style={{
              color: '#fff',
              fontSize: collapsed ? 16 : 20,
              whiteSpace: 'nowrap',
            }}
          >
            {collapsed ? 'ZLT' : 'Zoom Learning Tracker'}
          </Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 200, transition: 'margin-left 0.2s' }}>
        <Header
          style={{
            padding: '0 24px',
            background: token.colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            position: 'sticky',
            top: 0,
            zIndex: 9,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar
                src={sessionUser?.picture}
                icon={!sessionUser?.picture ? <UserOutlined /> : undefined}
              />
              <Text style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {sessionUser?.name || sessionUser?.email}
              </Text>
            </div>
          </Dropdown>
        </Header>

        <Content style={{ margin: 24, minHeight: 280 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}

