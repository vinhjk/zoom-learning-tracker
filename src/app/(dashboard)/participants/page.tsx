'use client';

import { useEffect, useState } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Space, Typography, message, Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import type { Participant } from '@/types';

const { Title } = Typography;

export default function ParticipantsPage() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [form] = Form.useForm();

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const url = search ? `/api/participants?search=${encodeURIComponent(search)}` : '/api/participants';
    fetch(url)
      .then((res) => res.json())
      .then((res) => {
        if (active) {
          setParticipants(res.data || []);
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
  }, [search, refreshKey]);

  const refresh = () => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const handleSubmit = async (values: Record<string, string>) => {
    try {
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { id: editing.id, ...values } : values;
      const res = await fetch('/api/participants', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      message.success(editing ? 'Đã cập nhật' : 'Đã thêm');
      setModalOpen(false); setEditing(null); form.resetFields(); refresh();
    } catch { message.error('Thao tác thất bại'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/participants?id=${id}`, { method: 'DELETE' });
      message.success('Đã xóa'); refresh();
    } catch { message.error('Xóa thất bại'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Học viên</Title>
        <Space>
          <Input.Search
            placeholder="Tìm kiếm..." allowClear
            prefix={<SearchOutlined />}
            onSearch={(v) => setSearch(v)} style={{ width: 250 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
            Thêm học viên
          </Button>
        </Space>
      </div>

      <Card>
        <Table
          dataSource={participants} rowKey="id" loading={loading}
          columns={[
            { title: 'Tên', dataIndex: 'name', key: 'name' },
            { title: 'Email', dataIndex: 'email', key: 'email', render: (v: string) => v || '—' },
            { title: 'Điện thoại', dataIndex: 'phone', key: 'phone', render: (v: string) => v || '—' },
            { title: 'Tổ chức', dataIndex: 'organization', key: 'organization', render: (v: string) => v || '—' },
            {
              title: 'Thao tác', key: 'actions',
              render: (_: unknown, record: Participant) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(record); form.setFieldsValue(record); setModalOpen(true); }} />
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
        title={editing ? 'Sửa học viên' : 'Thêm học viên'} open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()} okText="Lưu" cancelText="Hủy"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Tên" rules={[{ required: true, message: 'Nhập tên' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input type="email" />
          </Form.Item>
          <Form.Item name="phone" label="Điện thoại">
            <Input />
          </Form.Item>
          <Form.Item name="organization" label="Tổ chức">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

