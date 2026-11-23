'use client';

import { useEffect, useState } from 'react';
import { Card, Select, Table, Typography, Button, Space, Spin, message, Descriptions, Statistic, Row, Col } from 'antd';
import { DownloadOutlined, FileExcelOutlined } from '@ant-design/icons';
import type { Session } from '@/types';

const { Title } = Typography;

interface AttendeeReportItem {
  name: string;
  email: string | null;
  totalDuration: number;
  joinCount: number;
  attendanceScore: number;
}

interface SessionReport {
  session: Session & { program_name?: string };
  attendees: AttendeeReportItem[];
  totalAttendees: number;
}

export default function ReportsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(s => setSessions(s.data || []))
      .catch(() => message.error('Không thể tải dữ liệu'));
  }, []);

  const loadReport = async (sessionId: string) => {
    setSelectedSession(sessionId);
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?type=session&session_id=${sessionId}`);
      const { data } = await res.json();
      setReport(data);
    } catch { message.error('Không thể tải báo cáo'); }
    finally { setLoading(false); }
  };

  const exportReport = (format: 'csv' | 'excel') => {
    if (!selectedSession) return;
    window.open(`/api/reports?type=session&session_id=${selectedSession}&format=${format}`, '_blank');
  };

  return (
    <div>
      <Title level={3}>Báo cáo</Title>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            placeholder="Chọn buổi học để xem báo cáo" style={{ width: '100%' }}
            value={selectedSession} onChange={loadReport}
            options={sessions.map(s => ({ value: s.id, label: `${s.title} (${s.program_name || 'N/A'})` }))}
          />
        </Space>
      </Card>

      {loading && <Spin size="large" style={{ display: 'block', margin: '40px auto' }} />}

      {report && !loading && (
        <>
          <Card title="Thông tin buổi học" style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2, lg: 3 }}>
              <Descriptions.Item label="Tiêu đề">{report.session.title}</Descriptions.Item>
              <Descriptions.Item label="Chương trình">{report.session.program_name}</Descriptions.Item>
              <Descriptions.Item label="Thời lượng">{report.session.duration_minutes || '—'} phút</Descriptions.Item>
            </Descriptions>
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={8}>
                <Statistic title="Tổng học viên" value={report.totalAttendees} />
              </Col>
              <Col span={8}>
                <Statistic
                  title="TB điểm chuyên cần"
                  value={
                    report.attendees.length > 0
                      ? Math.round(report.attendees.reduce((s, a) => s + a.attendanceScore, 0) / report.attendees.length)
                      : 0
                  }
                  suffix="%"
                />
              </Col>
            </Row>
          </Card>

          <Card
            title="Chi tiết học viên"
            extra={
              <Space>
                <Button icon={<DownloadOutlined />} onClick={() => exportReport('csv')}>CSV</Button>
                <Button icon={<FileExcelOutlined />} onClick={() => exportReport('excel')} type="primary">Excel</Button>
              </Space>
            }
          >
            <Table<AttendeeReportItem>
              dataSource={report.attendees} rowKey="name"
              columns={[
                { title: 'Tên', dataIndex: 'name', key: 'name' },
                { title: 'Email', dataIndex: 'email', key: 'email', render: (v: string | null) => v || '—' },
                {
                  title: 'Thời gian (phút)', dataIndex: 'totalDuration', key: 'totalDuration',
                  render: (v: number) => Math.round(v / 60), sorter: (a: AttendeeReportItem, b: AttendeeReportItem) => a.totalDuration - b.totalDuration,
                },
                { title: 'Số lần tham gia', dataIndex: 'joinCount', key: 'joinCount' },
                {
                  title: 'Điểm chuyên cần (%)', dataIndex: 'attendanceScore', key: 'attendanceScore',
                  sorter: (a: AttendeeReportItem, b: AttendeeReportItem) => a.attendanceScore - b.attendanceScore,
                  render: (v: number) => {
                    const color = v >= 80 ? '#52c41a' : v >= 50 ? '#faad14' : '#ff4d4f';
                    return <span style={{ color, fontWeight: 'bold' }}>{v}%</span>;
                  },
                },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}

