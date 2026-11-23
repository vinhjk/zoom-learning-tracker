'use client';

import { useEffect, useState } from 'react';
import { Card, Table, Typography, Tag, message, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { WebhookEvent } from '@/types';

const { Title } = Typography;

export default function WebhooksPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/webhook-events?limit=100')
      .then((res) => res.json())
      .then((res) => {
        if (active) {
          setEvents(res.data || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          message.error('Không thể tải dữ liệu');
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [refreshKey]);

  const fetchEvents = () => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Sự kiện Webhook</Title>
        <Button icon={<ReloadOutlined />} onClick={fetchEvents} loading={loading}>Làm mới</Button>
      </div>

      <Card>
        <Table
          dataSource={events} rowKey="id" loading={loading}
          columns={[
            { title: 'Loại sự kiện', dataIndex: 'event_type', key: 'event_type' },
            { title: 'Event ID', dataIndex: 'event_id', key: 'event_id', ellipsis: true },
            { title: 'Meeting ID', dataIndex: 'meeting_id', key: 'meeting_id', render: (v: string) => v || '—' },
            {
              title: 'Trạng thái', dataIndex: 'processed', key: 'processed',
              render: (v: boolean) => v ? <Tag color="green">Đã xử lý</Tag> : <Tag color="orange">Chờ xử lý</Tag>,
            },
            {
              title: 'Lỗi', dataIndex: 'error_message', key: 'error_message',
              ellipsis: true,
              render: (v: string) => v ? <Tag color="red">{v}</Tag> : '—',
            },
            {
              title: 'Thời gian', dataIndex: 'created_at', key: 'created_at',
              render: (v: string) => new Date(v).toLocaleString('vi-VN'),
            },
          ]}
        />
      </Card>
    </div>
  );
}

