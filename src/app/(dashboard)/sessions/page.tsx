'use client';

import { useEffect, useState } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber,
  Space, Typography, Tag, message, Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Session, Program } from '@/types';

const { Title } = Typography;

const statusColors: Record<string, string> = {
  scheduled: 'blue', in_progress: 'green', completed: 'default', cancelled: 'red',
};
const statusLabels: Record<string, string> = {
  scheduled: 'Đã lên lịch', in_progress: 'Đang diễn ra', completed: 'Hoàn thành', cancelled: 'Đã hủy',
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [form] = Form.useForm();

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/sessions'), fetch('/api/programs')])
      .then(async ([sessRes, progRes]) => {
        const sessData = await sessRes.json();
        const progData = await progRes.json();
        if (active) {
          setSessions(sessData.data || []);
          setPrograms(progData.data || []);
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

  const refresh = () => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      const payload = {
        ...values,
        scheduled_start: values.scheduled_start ? (values.scheduled_start as dayjs.Dayjs).toISOString() : null,
        scheduled_end: values.scheduled_end ? (values.scheduled_end as dayjs.Dayjs).toISOString() : null,
      };
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { id: editing.id, ...payload } : payload;
      const res = await fetch('/api/sessions', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      message.success(editing ? 'Đã cập nhật' : 'Đã tạo');
      setModalOpen(false); setEditing(null); form.resetFields(); refresh();
    } catch { message.error('Thao tác thất bại'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/sessions?id=${id}`, { method: 'DELETE' });
      message.success('Đã xóa'); refresh();
    } catch { message.error('Xóa thất bại'); }
  };

  const handleSync = async (sessionId: string) => {
    setSyncing(sessionId);
    try {
      const res = await fetch('/api/zoom/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      message.success(`Đồng bộ thành công: ${data.data.new_records_synced} bản ghi mới`);
      refresh();
    } catch (err) {
      message.error(`Đồng bộ thất bại: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally { setSyncing(null); }
  };

  const openEdit = (session: Session) => {
    setEditing(session);
    form.setFieldsValue({
      ...session,
      scheduled_start: session.scheduled_start ? dayjs(session.scheduled_start) : null,
      scheduled_end: session.scheduled_end ? dayjs(session.scheduled_end) : null,
    });
    setModalOpen(true);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Buổi học</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
          Thêm buổi học
        </Button>
      </div>

      <Card>
        <Table
          dataSource={sessions} rowKey="id" loading={loading}
          columns={[
            { title: 'Tiêu đề', dataIndex: 'title', key: 'title' },
            { title: 'Chương trình', dataIndex: 'program_name', key: 'program_name' },
            { title: 'Zoom ID', dataIndex: 'zoom_meeting_id', key: 'zoom_meeting_id', render: (v: string) => v || '—' },
            {
              title: 'Trạng thái', dataIndex: 'status', key: 'status',
              render: (s: string) => <Tag color={statusColors[s]}>{statusLabels[s] || s}</Tag>,
            },
            {
              title: 'Thời gian', dataIndex: 'scheduled_start', key: 'scheduled_start',
              render: (v: string) => v ? new Date(v).toLocaleString('vi-VN') : '—',
            },
            { title: 'Thời lượng', dataIndex: 'duration_minutes', key: 'duration_minutes', render: (v: number) => v ? `${v} phút` : '—' },
            {
              title: 'Thao tác', key: 'actions',
              render: (_: unknown, record: Session) => (
                <Space>
                  {record.zoom_meeting_id && (
                    <Button size="small" icon={<SyncOutlined spin={syncing === record.id} />}
                      onClick={() => handleSync(record.id)} loading={syncing === record.id}>
                      Zoom
                    </Button>
                  )}
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                  <Popconfirm title="Xác nhận xóa?" onConfirm={() => handleDelete(record.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? 'Sửa buổi học' : 'Thêm buổi học'} open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()} okText="Lưu" cancelText="Hủy" width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="program_id" label="Chương trình" rules={[{ required: true, message: 'Chọn chương trình' }]}>
            <Select options={programs.map(p => ({ value: p.id, label: p.name }))} placeholder="Chọn chương trình" />
          </Form.Item>
          <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Nhập tiêu đề' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="zoom_meeting_id" label="Zoom Meeting ID">
            <Input placeholder="VD: 12345678901" />
          </Form.Item>
          <Form.Item name="scheduled_start" label="Bắt đầu">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="scheduled_end" label="Kết thúc">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="duration_minutes" label="Thời lượng (phút)">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="Trạng thái" initialValue="scheduled">
            <Select options={Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

