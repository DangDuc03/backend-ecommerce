# E-commerce API Backend

Đây là hệ thống API backend cho một ứng dụng thương mại điện tử, được xây dựng bằng Node.js, Express.js và TypeScript. Hệ thống cung cấp đầy đủ các chức năng cốt lõi từ quản lý người dùng, sản phẩm, giỏ hàng, đến xử lý đơn hàng và tích hợp chatbot AI thông minh.

## ✨ Tính Năng Chính

- **RESTful API:** Cung cấp đầy đủ các endpoint theo chuẩn REST cho các hoạt động của client.
- **Xác thực & Phân quyền:** Sử dụng JWT (Access Token & Refresh Token) để xác thực và phân quyền người dùng (User/Admin).
- **Quản lý Người dùng:** Đăng ký, đăng nhập, xem và cập nhật thông tin cá nhân, đổi mật khẩu.
- **Quản lý Sản phẩm & Danh mục:** CRUD (Tạo, Đọc, Cập nhật, Xóa) cho sản phẩm và danh mục (chỉ dành cho Admin).
- **Quản lý Giỏ hàng:** Thêm, xem, cập nhật số lượng và xóa sản phẩm trong giỏ hàng.
- **Quản lý Đơn hàng:** Đặt hàng, xem lịch sử mua hàng, hủy đơn hàng, quản lý đơn hàng (dành cho Admin).
- **Tích hợp Chatbot AI:** Sử dụng Google Gemini để hỗ trợ người dùng tương tác bằng ngôn ngữ tự nhiên (hỏi thông tin, thêm vào giỏ, đặt hàng, kiểm tra đơn,...).
- **Bảo mật:** Mật khẩu được băm an toàn sử dụng `bcrypt`.
- **Upload File:** Hỗ trợ upload hình ảnh cho sản phẩm và avatar người dùng.

## 🚀 Công Nghệ Sử Dụng

- **Backend:** Node.js, Express.js
- **Ngôn ngữ:** TypeScript
- **Cơ sở dữ liệu:** MongoDB với Mongoose ODM
- **Xác thực:** JSON Web Token (`jsonwebtoken`)
- **Bảo mật:** `bcrypt`
- **AI Service:** Google Gemini API
- **Valdation:** `express-validator`
- **Quản lý process:** `pm2`

## 🛠️ Hướng Dẫn Cài Đặt và Chạy Dự Án

### Yêu cầu tiên quyết

- [Node.js](httpss://nodejs.org/en/) (phiên bản >= 18.x)
- [Yarn](httpss://yarnpkg.com/) (hoặc `npm`)
- Một instance của [MongoDB](httpss://www.mongodb.com/) (có thể cài đặt local hoặc sử dụng dịch vụ cloud như MongoDB Atlas)

### Các bước cài đặt

1.  **Clone repository về máy của bạn:**
    ```bash
    git clone <URL_CUA_REPOSITORY_NAY>
    ```

2.  **Di chuyển vào thư mục dự án:**
    ```bash
    cd api-ecom
    ```

3.  **Cài đặt các dependencies:**
    ```bash
    yarn install
    ```
    *hoặc nếu bạn dùng npm:*
    ```bash
    npm install
    ```

4.  **Thiết lập biến môi trường:**
    Tạo một file tên là `.env` ở thư mục gốc của dự án và sao chép nội dung từ file `.env.example` hoặc sử dụng cấu trúc dưới đây.

    ```env
**Tạo file `.env` (hoặc `.env.production` khi deploy)**
```env
PORT=4000
SECRET_KEY_JWT=your_jwt_secret
USERNAME_DB=your_mongodb_user
PASSWORD_DB=your_mongodb_password
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
AI_PROVIDER=gemini # hoặc openai
```
    ```
    > **Lưu ý:** Hãy thay thế các giá trị trong dấu ngoặc kép (`""`) bằng thông tin cấu hình thực tế của bạn.

5.  **Chạy dự án ở chế độ development:**
    Server sẽ tự động khởi động lại mỗi khi có thay đổi trong mã nguồn.
    ```bash
    yarn dev
    ```

6.  **Build và chạy dự án ở chế độ production:**
    ```bash
    # Bước 1: Build mã nguồn TypeScript sang JavaScript
    yarn build

    # Bước 2: Khởi động server
    yarn start
    ```

## 📂 Cấu Trúc Thư Mục

Dự án được cấu trúc theo mô hình gần với MVC (Model-View-Controller) để đảm bảo sự rõ ràng và dễ bảo trì.

```
/api-ecom
├── build/              // Thư mục chứa code JavaScript đã được build cho production
├── controllers/        // Chứa business logic, xử lý các yêu cầu
├── database/
│   └── models/         // Định nghĩa Mongoose Schema và Model
├── environments/       // Cấu hình biến môi trường
├── middleware/         // Các middleware của Express (vd: check auth)
├── routes/             // Định nghĩa các API endpoints
├── utils/              // Chứa các hàm tiện ích, services (AI, chat,...)
├── index.ts            // Điểm khởi đầu của ứng dụng
├── package.json        // Thông tin dự án và danh sách dependencies
├── tsconfig.json       // Cấu hình cho TypeScript compiler
└── README.md           // Chính là file này
```

## 🧪 Thử Nghiệm API

Để thuận tiện cho việc kiểm tra các API, dự án có đính kèm một bộ sưu tập cho **Postman**. Bạn có thể nhập file `Ecommerce.postman_collection.json` vào Postman để có ngay danh sách các endpoint đã được cài đặt sẵn.

---
**dangcongduc © 2025 E-Commerce API**
