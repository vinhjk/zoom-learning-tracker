'use client';

import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Typography, Spin, Tag, message } from 'antd';
import {
  BookOutlined,
  CalendarOutlined,
  TeamOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { Session } from '@/types';

const { Title } = Typography;

interface DashboardData {
  totalPrograms: number;
  totalSessions: number;
  totalParticipants: number;
  avgAttendanceMinutes: number;
  recentSessions: Session[];
}

const statusColors: Record<string, string> = {
  scheduled: 'blue',
  in_progress: 'green',
  completed: 'default',
  cancelled: 'red',
};

const statusLabels: Record<string, string> = {
  scheduled: 'Đã lên lịch',
  in_progress: 'Đang diễn ra',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports?type=dashboard')
      .then((res) => res.json())
      .then((res) => setData(res.data))
      .catch(() => message.error('Không thể tải dữ liệu'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div>
      <Title level={3}>Tổng quan</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Chương trình"
              value={data?.totalPrograms || 0}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Buổi học"
              value={data?.totalSessions || 0}
              prefix={<CalendarOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Học viên"
              value={data?.totalParticipants || 0}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="TB thời gian tham gia"
              value={data?.avgAttendanceMinutes || 0}
              suffix="phút"
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Buổi học gần đây">
        <Table
          dataSource={data?.recentSessions || []}
          rowKey="id"
          pagination={false}
          columns={[
            { title: 'Tiêu đề', dataIndex: 'title', key: 'title' },
            { title: 'Chương trình', dataIndex: 'program_name', key: 'program_name' },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              render: (status: string) => (
                <Tag color={statusColors[status]}>{statusLabels[status] || status}</Tag>
              ),
            },
            {
              title: 'Thời gian',
              dataIndex: 'scheduled_start',
              key: 'scheduled_start',
              render: (v: string) => (v ? new Date(v).toLocaleString('vi-VN') : '—'),
            },
          ]}
        />
      </Card>
    </div>
  );
}

