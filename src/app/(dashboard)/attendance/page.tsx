'use client';

import { useEffect, useState } from 'react';
import { Card, Table, Select, Typography, message, Tag, Space } from 'antd';
import type { AttendanceRecord, Session } from '@/types';

const { Title } = Typography;

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((r) => setSessions(r.data || []))
      .catch(() => message.error('Không thể tải buổi học'));
  }, []);

  useEffect(() => {
    let active = true;
    const url = selectedSession
      ? `/api/attendance?session_id=${selectedSession}`
      : '/api/attendance';
    fetch(url)
      .then((res) => res.json())
      .then((res) => {
        if (active) {
          setRecords(res.data || []);
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
  }, [selectedSession]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}>Điểm danh</Title>
        <Space>
          <Select
            placeholder="Lọc theo buổi học" allowClear style={{ width: 300 }}
            value={selectedSession} onChange={setSelectedSession}
            options={sessions.map((s) => ({ value: s.id, label: s.title }))}
          />
        </Space>
      </div>

      <Card>
        <Table
          dataSource={records} rowKey="id" loading={loading}
          columns={[
            { title: 'Học viên', dataIndex: 'participant_name', key: 'participant_name' },
            { title: 'Email', dataIndex: 'participant_email', key: 'participant_email', render: (v: string) => v || '—' },
            { title: 'Buổi học', dataIndex: 'session_title', key: 'session_title' },
            {
              title: 'Giờ vào', dataIndex: 'join_time', key: 'join_time',
              render: (v: string) => v ? new Date(v).toLocaleString('vi-VN') : '—',
            },
            {
              title: 'Giờ ra', dataIndex: 'leave_time', key: 'leave_time',
              render: (v: string) => v ? new Date(v).toLocaleString('vi-VN') : <Tag color="orange">Chưa rời</Tag>,
            },
            {
              title: 'Thời gian', dataIndex: 'duration_seconds', key: 'duration_seconds',
              render: (v: number) => v > 0 ? `${Math.round(v / 60)} phút` : '—',
            },
          ]}
        />
      </Card>
    </div>
  );
}

