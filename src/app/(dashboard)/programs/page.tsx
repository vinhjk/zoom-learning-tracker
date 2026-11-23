'use client';

import { useEffect, useState } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, Space, Typography, Tag, message, Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Program } from '@/types';

const { Title } = Typography;

const statusOptions = [
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'archived', label: 'Lưu trữ' },
];

const statusColors: Record<string, string> = {
  active: 'green', completed: 'blue', archived: 'default',
};

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);
  const [form] = Form.useForm();

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/programs')
      .then((res) => res.json())
      .then((res) => {
        if (active) {
          setPrograms(res.data || []);
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

  const handleSubmit = async (values: Record<string, string>) => {
    try {
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { id: editing.id, ...values } : values;
      const res = await fetch('/api/programs', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      message.success(editing ? 'Đã cập nhật' : 'Đã tạo');
      setModalOpen(false); setEditing(null); form.resetFields(); refresh();
    } catch { message.error('Thao tác thất bại'); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/programs?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      message.success('Đã xóa'); refresh();
    } catch { message.error('Xóa thất bại'); }
  };

  const openEdit = (program: Program) => {
    setEditing(program);
    form.setFieldsValue(program);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'active' });
    setModalOpen(true);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Chương trình học</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm chương trình</Button>
      </div>

      <Card>
        <Table
          dataSource={programs} rowKey="id" loading={loading}
          columns={[
            { title: 'Tên chương trình', dataIndex: 'name', key: 'name' },
            { title: 'Mô tả', dataIndex: 'description', key: 'description', ellipsis: true },
            {
              title: 'Trạng thái', dataIndex: 'status', key: 'status',
              render: (s: string) => <Tag color={statusColors[s]}>{statusOptions.find(o => o.value === s)?.label || s}</Tag>,
            },
            {
              title: 'Ngày tạo', dataIndex: 'created_at', key: 'created_at',
              render: (v: string) => new Date(v).toLocaleDateString('vi-VN'),
            },
            {
              title: 'Thao tác', key: 'actions',
              render: (_: unknown, record: Program) => (
                <Space>
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
        title={editing ? 'Sửa chương trình' : 'Thêm chương trình'}
        open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()} okText="Lưu" cancelText="Hủy"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Tên chương trình" rules={[{ required: true, message: 'Vui lòng nhập tên' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="status" label="Trạng thái">
            <Select options={statusOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

