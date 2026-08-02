# Ecommerce Backend

REST API cho nền tảng thương mại điện tử full-stack — xây dựng bằng Node.js, Express, TypeScript và MongoDB, với các kỹ thuật xử lý đồng thời và tích hợp thanh toán thật.

## 🎯 Điểm nổi bật

- **MongoDB Transaction & Race Condition handling** — đặt hàng (trừ kho, tạo đơn, áp mã giảm giá, xóa giỏ hàng) chạy trong 1 transaction ACID; giới hạn số lượt dùng mã giảm giá được xử lý atomic để tránh vượt quá số lượng khi nhiều người dùng cùng lúc.
- **Tích hợp thanh toán PayPal thật** — OAuth 2.0, luồng Create Order → Capture Order 2 bước, xác thực Webhook bằng cách gọi ngược lại API PayPal (không tự tính chữ ký).
- **Kiến trúc giỏ hàng 2 tầng** — Session Cart (Redis, cho khách chưa đăng nhập, tự hết hạn) và Persistent Cart (MongoDB, cho user đã đăng nhập), có cơ chế merge tự động khi đăng nhập.

## 🛠️ Tech Stack

Node.js · Express 5 · TypeScript · MongoDB (Mongoose) · Redis (Upstash) · JWT · Cloudinary · Nodemailer · Zod

## ✨ Tính năng

**Xác thực & Phân quyền**

- JWT 2 lớp (Access + Refresh Token) với cơ chế xoay vòng (rotation) chống đánh cắp token
- Xác thực email, quên/đặt lại mật khẩu, đổi mật khẩu
- Khóa tài khoản tạm thời sau nhiều lần đăng nhập sai
- Phân quyền theo vai trò (Admin/User)

**Danh mục & Sản phẩm**

- Cây danh mục phân cấp (Materialized Path), tối đa 3 cấp
- Sản phẩm đa biến thể (variant), tự động tính giá/tồn kho từ variant đang hoạt động
- Soft delete (lưu trữ) và hard delete (xóa vĩnh viễn) tách biệt

**Giỏ hàng, Yêu thích, Mã giảm giá**

- Giỏ hàng 2 tầng như đã nêu ở trên
- Danh sách yêu thích (toggle)
- Mã giảm giá theo %/số tiền cố định, giới hạn lượt dùng an toàn với race condition

**Đơn hàng & Thanh toán**

- Vòng đời đơn hàng theo State Machine (pending → confirmed → processing → shipped → delivered/cancelled)
- Nhật ký thay đổi trạng thái (audit timeline)
- Thanh toán khi nhận hàng (COD) và PayPal (OAuth 2.0 + Webhook)
- Idempotency cho webhook — chống xử lý trùng lặp khi cổng thanh toán gọi lại nhiều lần

**Tìm kiếm & Đánh giá**

- Tìm kiếm nâng cao bằng MongoDB Aggregation Pipeline (`$facet`) — trả kết quả, tổng số, và thống kê lọc (brand/giá/rating) trong 1 query
- Autocomplete, sản phẩm thịnh hành, sản phẩm tương tự
- Cache kết quả tìm kiếm bằng Redis, tự động làm mới khi sản phẩm thay đổi
- Đánh giá sản phẩm kèm auto-moderation, xác minh đã mua hàng (verified purchase)

## 🏗️ Kiến trúc đáng chú ý

**Luồng đặt hàng (MongoDB Transaction):**

```
placeOrder()
  ├─ Trừ tồn kho từng sản phẩm (nhiều lệnh ghi Product)
  ├─ Tạo Order (snapshot giá/tên tại thời điểm đặt)
  ├─ Áp dụng mã giảm giá (atomic update có điều kiện)
  └─ Xóa giỏ hàng
  → Toàn bộ cùng thành công hoặc cùng rollback
```

**Luồng thanh toán PayPal:**

```
Frontend → POST /payments/initiate → PayPal (redirect)
User xác nhận trên PayPal
  → GET /payments/paypal/return → Capture Order → cập nhật Order.payment.status
  → (song song) PayPal Webhook → xác nhận độc lập, idempotent
```

## 📁 Cấu trúc thư mục

```
src/
├── config/          # kết nối DB, biến môi trường
├── models/          # Mongoose Schema
├── validations/       # Zod schema validate input
├── services/            # business logic
├── controllers/            # nhận request, gọi service, trả response
├── middleware/                # auth, upload, rate limit, sanitize
├── routes/                       # định nghĩa endpoint
├── utils/                          # AppError, jwt helper
└── @types/                           # type mở rộng Express Request
```

## 🚀 Cài đặt local

```bash
git clone https://github.com/phamdinhkhoik2/ecommerce-backend.git
cd ecommerce-backend
npm install
```

Tạo file `.env` theo mẫu `.env.example` (MongoDB URI, JWT secrets, Cloudinary, Redis, PayPal credentials...).

```bash
npm run dev
```

## 📝 License

MIT
