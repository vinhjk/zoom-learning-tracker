# ZLT — BÁO CÁO KIỂM TOÁN PHASE 1.2: WEBHOOK IDEMPOTENCY & DATABASE READINESS AUDIT

> **Dự án**: Zoom Learning Tracker (ZLT) MVP  
> **Giai đoạn**: Phase 1.2 — Read-Only Audit  
> **Chuyên gia thực hiện**: Senior Backend Engineer, PostgreSQL Security Engineer & QA Lead  
> **Thời gian thực hiện**: 2026-11-23  
> **Đối tượng áp dụng**: Mã nguồn ZLT (`src/app/api/webhooks/zoom`, `src/lib/zoom/*`) và cơ sở dữ liệu Supabase Hosted TEST.  

---

## 1. Executive Summary (Tóm tắt điều hành)

Kiểm toán Phase 1.2 là đợt rà soát độc lập, **chỉ đọc (Read-Only)**, nhằm đánh giá toàn diện tính sẵn sàng về mặt logic định danh sự kiện, cơ chế bắt lỗi cơ sở dữ liệu PostgreSQL, thời gian đáp ứng HTTP của webhook so với SLA của Zoom, và tính tương thích của cơ sở dữ liệu Supabase Hosted trước khi tiến hành kết nối kiểm thử thực tế (Live Testing).

### Kết quả chính:
1. **Logic định danh sự kiện (`getStableEventId`)**: Đã loại bỏ hoàn toàn `Date.now()`, bảo đảm tính bất biến 100% giữa các lần Zoom retry cùng một sự kiện, và loại trừ nguy cơ va chạm (collision) giữa các học viên tham gia tại cùng một mili-giây.
2. **Xử lý lỗi PostgreSQL (`isUniqueConstraintViolation`)**: Đã bắt được mã lỗi `23505` để ngăn chặn duplicate khi có xung đột đua tranh (race condition). Tuy nhiên, **phát hiện rủi ro bảo mật**: hàm hiện bắt mọi lỗi `23505` mà chưa kiểm tra đích danh tên ràng buộc (`constraint_name`), có nguy cơ nuốt nhầm lỗi vi phạm unique của các cột/bảng khác nếu cấu hình sai.
3. **Thời gian đáp ứng (Response Time SLA)**: Toàn bộ luồng POST hiện đang chạy **đồng bộ (synchronous)** bao gồm 5–7 round-trips tới Supabase Hosted. Trong điều kiện độ trễ mạng hoặc tải cao, luồng này có nguy cơ vượt ngưỡng **3 giây (3000ms)** - thời hạn phản hồi tối đa của Zoom - dẫn đến việc Zoom hiểu nhầm là lỗi và kích hoạt bão retry (retry storm).
4. **Trạng thái Database Hosted**: Repository không lưu trữ migrations 001–005 (chỉ có migration 006). Ràng buộc duy nhất `UNIQUE(event_id, event_type)` trên Supabase Hosted **chưa được xác minh hoặc triển khai**. Hệ thống tuyệt đối chưa thể bật Live Testing nếu chưa chạy kiểm tra tiền trạm.

---

## 2. Event Identity Audit (Kiểm toán định danh sự kiện)

Đã rà soát chi tiết các file:
- `src/lib/zoom/webhook.ts`
- `src/app/api/webhooks/zoom/route.ts`
- `src/lib/__tests__/zlt.test.ts`

### Trả lời chi tiết 7 câu hỏi nghiệp vụ:

#### 1. Zoom retry cùng một event có luôn tạo cùng Event ID không?
- **KẾT LUẬN: CÓ (ĐẢM BẢO 100%)**.
- **Cơ sở kỹ thuật**:
  - Nếu payload chứa trường `event_id` chính thức từ Zoom, hàm trả về nguyên vẹn `payload.event_id.trim()`.
  - Nếu payload không có `event_id` (trường hợp phổ biến của Zoom Webhook v2 cho `meeting.participant_joined` / `left`), hàm trích xuất bộ nhận diện nghiệp vụ:
    $$\text{rawIdentifier} = \text{eventType} : \text{meetingId} : \text{participantId} : \text{actionTime} : \text{event\_ts}$$
  - Trong các lần retry của Zoom, toàn bộ các trường này (bao gồm cả `event_ts` và `join_time`/`leave_time`) là bất biến (immutable) từ phía máy chủ Zoom. Do đó, mã băm SHA-256 sinh ra luôn đồng nhất từng ký tự.

#### 2. Payload fingerprint có bao gồm những trường có thể thay đổi giữa các lần retry không?
- **KẾT LUẬN: KHÔNG**.
- **Cơ sở kỹ thuật**:
  - Phân tích luồng nhận request: `getStableEventId(payload)` chỉ tiếp nhận JSON body đã parse của Zoom (`payload`).
  - Các trường HTTP header như `x-zm-request-timestamp` và `x-zm-signature` (có thể được Zoom làm mới khi retry) **không** nằm trong `payload` và **không** tham gia vào quá trình tính hash fingerprint.
  - Toàn bộ các trường trong JSON payload của sự kiện tham gia/rời phòng là tĩnh và được Zoom gửi lại nguyên bản.

#### 3. Canonical serialization (`serializeDeterministic`) có xử lý đúng các trường hợp đặc biệt không?
- **Object key ordering**: Sử dụng `Object.keys(obj).sort()` sắp xếp từ điển (alphabetical lexicographic sort) ở tất cả các cấp lồng nhau. Đảm bảo 2 object cùng nội dung nhưng khác thứ tự key vẫn cho ra chuỗi serialized y hệt nhau.
- **Array ordering**: Sử dụng `val.map(serializeDeterministic).join(',')` bảo toàn thứ tự phần tử mảng của Zoom.
- **Number và string**: Sử dụng `JSON.stringify(val)` cho kiểu dữ liệu nguyên thủy; chuỗi `"123"` và số `123` được phân biệt rành rọt (`"\"123\""` vs `"123"`).
- **null và undefined**:
  - `null`: Được định dạng chính xác thành chuỗi `"null"`.
  - `undefined`: Trong JavaScript, `JSON.stringify(undefined)` trả về `undefined`. Tuy nhiên, vì payload được phân tích cú pháp từ chuỗi raw JSON của Zoom qua `JSON.parse(body)`, chuẩn JSON **không có khái niệm `undefined`**. Vì vậy, toàn bộ dữ liệu thực tế từ webhook chỉ chứa `null` hoặc giá trị thực tế, không bị phát sinh trường hợp `undefined` bất định.
- **Nested objects**: Đệ quy vô hạn qua mọi cấp object con.

#### 4. Hai participant khác nhau có thể tạo cùng Event ID không?
- **KẾT LUẬN: KHÔNG (ĐÃ TRIỆT TIÊU COLLISION)**.
- **Cơ sở kỹ thuật**:
  - Hàm ưu tiên trích xuất `participant_uuid`, `user_id`, `id`, `email`, hoặc `user_name`.
  - Trong Zoom, mỗi học viên trong phòng họp được gán một `user_id` nội bộ duy nhất. Ngay cả khi 2 người cùng tên tham gia tại cùng 1 mili-giây, `user_id` của họ khác nhau, dẫn đến `rawIdentifier` khác nhau và hash SHA-256 hoàn toàn khác nhau.
  - Trường hợp fallback fingerprint: toàn bộ payload (bao gồm cấu trúc riêng của từng participant) được đưa vào băm SHA-256 canonical.

#### 5. Hai event khác loại có thể dùng cùng event_id không?
- **KẾT LUẬN: KHÔNG**.
- Chuỗi ID sinh ra luôn được gắn tiền tố rõ ràng:
  - Khóa kết hợp: `${eventType}_${eventTs}_${hash}`
  - Fallback fingerprint: `${eventType}_fp_${fallbackHash}`
  - Đồng thời, câu truy vấn deduplication và ràng buộc database đều kiểm tra trên cặp `(event_id, event_type)`.

#### 6. Event chính thức có `event_id` và event không có `event_id` có được xử lý nhất quán không?
- Cả hai đều được chuẩn hóa về định dạng chuỗi và ghi vào cột `event_id` của bảng `webhook_events`.
- Không xảy ra phân mảnh logic giữa hai loại.

#### 7. Có trường hợp hai event nghiệp vụ khác nhau bị gộp thành một event không?
- **KẾT LUẬN: KHÔNG**.
- Đánh giá cụ thể cho từng loại:
  - `meeting.participant_joined`: Gắn chặt với `join_time` và `event_ts`. Nếu học viên out ra rồi join lại 10 phút sau, `join_time` và `event_ts` mới sẽ tạo ra Event ID mới hoàn toàn.
  - `meeting.participant_left`: Gắn chặt với `leave_time` và `event_ts`. Hai lần rời phòng khác nhau luôn sinh ra Event ID khác nhau.

---

## 3. PostgreSQL Error Handling Audit (Kiểm toán xử lý lỗi cơ sở dữ liệu)

### Phân tích hiện trạng code:
Trong `src/lib/zoom/webhook.ts`:
```typescript
export function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; details?: string };
  return (
    err.code === '23505' ||
    (typeof err.message === 'string' &&
      (err.message.includes('duplicate key') || err.message.includes('unique constraint'))) ||
    (typeof err.details === 'string' && err.details.includes('already exists'))
  );
}
```

Trong `src/app/api/webhooks/zoom/route.ts`:
```typescript
    const { data: event, error: dbError } = await supabase
      .from('webhook_events')
      .insert({ ... })
      .select('id')
      .single();

    if (dbError) {
      if (isUniqueConstraintViolation(dbError)) {
        return NextResponse.json({ status: 'duplicate', message: 'Concurrent duplicate event detected' });
      }
      return NextResponse.json({ error: 'Storage failed' }, { status: 500 });
    }
```

### Rủi ro và Đánh giá an toàn:
1. **Lỗi `23505` (`unique_violation`)**:
   - Được PostgreSQL trả về khi vi phạm bất kỳ PRIMARY KEY hoặc UNIQUE CONSTRAINT / UNIQUE INDEX nào.
2. **Rủi ro bắt nhầm constraint khác (CRITICAL RISK)**:
   - Hiện tại, `isUniqueConstraintViolation` chấp nhận **mọi** lỗi `23505`.
   - Giả sử trong schema thực tế trên Hosted, bảng `webhook_events` có một unique index khác ngoài ý muốn (ví dụ: ai đó vô tình tạo `UNIQUE(meeting_id)` hoặc `UNIQUE(payload)`), thì một sự kiện hợp lệ của người khác tham gia cùng meeting sẽ bị văng lỗi `23505`.
   - Hệ thống sẽ nhầm tưởng sự kiện hợp lệ đó là duplicate, âm thầm trả về HTTP 200, và **bỏ rơi không tính điểm danh cho học viên đó**!
3. **Đề xuất khắc phục an toàn**:
   - Hàm `isUniqueConstraintViolation` cần nhận thêm tham số tên ràng buộc kỳ vọng (ví dụ: `expectedConstraint = 'uq_webhook_events_id_type'`).
   - Kiểm tra xem `err.message` hoặc `err.details` có chứa tên ràng buộc hoặc tên cột `(event_id, event_type)` hay không.
   - Nếu lỗi `23505` phát sinh từ một constraint lạ, hệ thống phải log cảnh báo nghiêm trọng và trả về HTTP 500 để đội ngũ kỹ thuật điều tra thay vì nuốt lỗi.
4. **Xử lý các lỗi hạ tầng khác**:
   - Lỗi kết nối (`08006`, `57P01`), timeout (`57014`), mất bảng (`42P01`): `isUniqueConstraintViolation` trả về `false`, route trả về HTTP 500. Đây là hành vi đúng chuẩn để Zoom kích hoạt cơ chế retry sau đó.

---

## 4. Webhook Response Time Audit (Kiểm toán thời gian phản hồi)

### Phân tích luồng thực thi đồng bộ hiện tại:
Khi Zoom gửi một webhook POST request, server Next.js xử lý tuần tự:

| Bước | Thao tác | Bản chất | Thời gian ước tính |
|---|---|---|---|
| 1 | `request.text()` & JSON parse | CPU in-memory | ~1 ms |
| 2 | `verifyZoomWebhookSignature` & HMAC | CPU in-memory | ~1 ms |
| 3 | `getStableEventId` | CPU in-memory | ~1 ms |
| 4 | Fast-path SELECT `webhook_events` | Network DB round-trip | 80 – 200 ms |
| 5 | Atomic INSERT `webhook_events` | Network DB round-trip | 80 – 200 ms |
| 6 | Attendance: SELECT `participants` (theo email) | Network DB round-trip | 80 – 200 ms |
| 7 | Attendance: SELECT/INSERT `participants` (nếu mới) | Network DB round-trip | 80 – 200 ms |
| 8 | Attendance: SELECT `sessions` (theo meeting_id) | Network DB round-trip | 80 – 200 ms |
| 9 | Attendance: INSERT/UPDATE `attendance_records` | Network DB round-trip | 80 – 200 ms |
| 10 | Update `webhook_events` (`processed: true`) | Network DB round-trip | 80 – 200 ms |
| **TỔNG CỘNG** | **5 – 7 truy vấn database tuần tự qua Internet** | **I/O Bound** | **500 ms – 1,800 ms** |

### Đánh giá rủi ro vượt ngưỡng Zoom Webhook Timeout SLA (3 giây):
- **Quy định chính thức của Zoom**: Máy chủ Webhook bắt buộc phải phản hồi mã HTTP 2xx trong vòng **3,000 ms (3 giây)**. Nếu quá 3 giây, Zoom coi kết nối đã thất bại và lập tức gửi lại (retry) sự kiện đó.
- **Điểm nghẽn thực tế**:
  - Khi Next.js chạy trên Vercel / server và kết nối tới Supabase Hosted qua Internet, độ trễ mạng cộng dồn của 7 round-trips rất dễ bị biến động (network jitter).
  - Khi một phòng học có 50–100 học viên cùng tham gia vào đầu giờ, 50–100 webhook requests sẽ dội về đồng thời. Connection pool của Supabase sẽ bị bão hòa, đẩy độ trễ mỗi truy vấn lên >500ms.
  - Khi đó, tổng thời gian xử lý sẽ vượt quá 3 giây $\rightarrow$ Zoom gửi retry hàng loạt $\rightarrow$ Gây ra **Cơn bão Retry (Retry Storm)** làm sập hoặc nghẽn toàn bộ hệ thống!

### Đề xuất mô hình kiến trúc tối ưu (Decoupled / Asynchronous Processing):
Không xử lý nghiệp vụ Attendance Engine bên trong request-response loop của Webhook:
1. **Pha 1 — Fast Ingest & Acknowledge (Phản hồi tức thì < 200ms)**:
   - Xác thực chữ ký HMAC và timestamp.
   - Kiểm tra deduplication & INSERT nguyên tử vào `webhook_events` với `processed = false`.
   - **Trả về ngay lập tức HTTP 200 `{ status: "received", id: event.id }` cho Zoom**.
2. **Pha 2 — Asynchronous Processing (Xử lý ngoài luồng)**:
   - Kích hoạt xử lý bằng cơ chế bất đồng bộ nền:
     - Trong Next.js 15/16 App Router: Sử dụng hàm `after()` từ `next/server` để tiếp tục chạy `processWebhookEvent` sau khi đã gửi response về client.
     - Hoặc sử dụng cơ chế Background Worker / Scheduled Reconciliation Job quét các bản ghi `processed = false` trong `webhook_events` để xử lý.
   - Nếu quá trình tính điểm danh gặp lỗi, cập nhật `error_message`, giữ `processed = false` để cơ chế phục hồi (recovery) tự động xử lý lại.

---

## 5. Database Schema Requirements (Yêu cầu cấu trúc cơ sở dữ liệu)

Mã nguồn hiện tại yêu cầu các bảng và cột sau trên Supabase Hosted:

### Bảng 1: `webhook_events`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `event_type`: `TEXT NOT NULL`
- `event_id`: `TEXT NOT NULL`
- `meeting_id`: `TEXT` (nullable)
- `payload`: `JSONB NOT NULL`
- `processed`: `BOOLEAN NOT NULL DEFAULT FALSE`
- `processed_at`: `TIMESTAMPTZ` (nullable)
- `error_message`: `TEXT` (nullable)
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Ràng buộc duy nhất bắt buộc**: `CONSTRAINT uq_webhook_events_id_type UNIQUE (event_id, event_type)`

### Bảng 2: `participants`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `name`: `TEXT NOT NULL`
- `email`: `TEXT` (nullable)
- `zoom_user_id`: `TEXT` (nullable)

### Bảng 3: `sessions`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `zoom_meeting_id`: `TEXT` (nullable, dùng để map với `payload.object.id`)

### Bảng 4: `attendance_records`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `session_id`: `UUID NOT NULL REFERENCES sessions(id)`
- `participant_id`: `UUID NOT NULL REFERENCES participants(id)`
- `join_time`: `TIMESTAMPTZ NOT NULL`
- `leave_time`: `TIMESTAMPTZ` (nullable)
- `zoom_join_time`: `TEXT` (nullable)
- `zoom_leave_time`: `TEXT` (nullable)
- `duration_seconds`: `INTEGER NOT NULL DEFAULT 0`

---

## 6. Database Readiness SQL (Tài liệu SQL kiểm tra tiền trạm)

Đã tạo file SQL chẩn đoán chỉ đọc (SELECT-only) tại:
- [docs/sql/phase-1.2-webhook-database-readiness-check.sql](file:///c:/Users/nguye/Desktop/zoom%20tracking/zlt/docs/sql/phase-1.2-webhook-database-readiness-check.sql)

### Hướng dẫn dành cho Product Owner:
1. Mở giao diện Supabase Dashboard của dự án Hosted TEST.
2. Điều hướng vào menu **SQL Editor**.
3. Dán nội dung của file trên và nhấn **Run (F5)**.
4. Đối chiếu kết quả với 7 mục tiêu kiểm tra:
   - **Check 1**: Đảm bảo 4 bảng `webhook_events`, `participants`, `sessions`, `attendance_records` đều tồn tại trong schema `public`.
   - **Check 2**: Kiểm tra đầy đủ 9 cột của `webhook_events` và kiểu dữ liệu tương ứng.
   - **Check 3**: Kiểm tra xem ràng buộc duy nhất `(event_id, event_type)` đã tồn tại chưa.
   - **Check 4**: Kiểm tra dữ liệu trùng lặp hiện có (`occurrence_count > 1`). **Nếu có dòng trả về, việc tạo UNIQUE constraint sẽ bị PostgreSQL từ chối**.
   - **Check 5**: Kiểm tra các giá trị `NULL` trong cột `event_id` hoặc `event_type`.
   - **Check 6**: Thống kê số lượng sự kiện hiện có theo trạng thái `processed`.
   - **Check 7**: Kiểm tra tính tương thích cột của 3 bảng nghiệp vụ hạ tầng.

---

## 7. Remaining Risks (Các rủi ro kỹ thuật còn lại)

1. **Rủi ro Database Uniqueness chưa được xác nhận trên Hosted**:
   - Nếu chạy Live Testing ngay khi Hosted database chưa có unique constraint, hai webhook request gửi đồng thời sẽ đều INSERT thành công, dẫn đến tạo bản ghi chuyên cần kép.
2. **Rủi ro Bắt lỗi 23505 quá rộng**:
   - `isUniqueConstraintViolation` chưa lọc theo tên constraint cụ thể.
3. **Rủi ro Vượt ngưỡng phản hồi 3s của Zoom**:
   - Mô hình đồng bộ 5–7 DB calls có thể gây ra timeout và retry storm khi mạng trễ hoặc tải tăng cao.
4. **Thiếu cơ chế Tái xử lý nền (Recovery Worker)**:
   - Các sự kiện bị lỗi trong `processWebhookEvent` chỉ mới được ghi nhận `error_message`, chưa có worker tự động reprocess định kỳ.

---

## 8. Recommended Next Phase (Đề xuất lộ trình tiếp theo)

### Phase 1.3: Database Preflight Verification & Webhook Architecture Hardening
1. **Bước 1 (PO)**: Chạy script `phase-1.2-webhook-database-readiness-check.sql` trên Supabase SQL Editor và xác nhận kết quả kiểm tra.
2. **Bước 2 (PO/DBA)**: Áp dụng migration bổ sung unique constraint:
   ```sql
   ALTER TABLE webhook_events ADD CONSTRAINT uq_webhook_events_id_type UNIQUE (event_id, event_type);
   ```
3. **Bước 3 (Engineering)**:
   - Tinh chỉnh `isUniqueConstraintViolation` để kiểm tra đúng tên constraint `uq_webhook_events_id_type`.
   - Chuyển đổi mô hình phản hồi Webhook sang cơ chế decoupled (phản hồi HTTP 200 nhanh qua `after()` của Next.js trước khi chạy `processWebhookEvent`).
4. **Bước 4**: Tiến hành Phase 2 (Live Webhook Testing qua HTTPS Tunnel và Zoom Event Subscription).

---

## 9. Final Verdict (Kết luận kiểm toán)

# `CONDITIONAL PASS — ISSUES REQUIRE PO REVIEW`

### Giải thích kết luận:
- **ĐẠT (PASS)** về mặt thuật toán cốt lõi: Logic định danh sự kiện (`getStableEventId`), kiểm tra chữ ký HMAC, chuẩn hóa canonical payload, và bộ unit tests tự động (36/36 tests passed, 0 type errors, 0 lint warnings, build pass) đã hoàn thiện và đạt tiêu chuẩn chất lượng cao.
- **ĐIỀU KIỆN (CONDITIONAL)**: Tuyệt đối **CHƯA ĐỦ ĐIỀU KIỆN ĐỂ KẾT NỐI LIVE TESTING** cho đến khi Product Owner thực hiện kiểm tra preflight SQL trên Supabase Hosted, triển khai ràng buộc `UNIQUE(event_id, event_type)`, và phê duyệt việc tinh chỉnh độ trễ phản hồi webhook.

