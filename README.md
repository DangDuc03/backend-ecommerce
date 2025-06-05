# E-Commerce API (Node.js/Express/MongoDB)

## Mô tả
Backend cho hệ thống e-commerce, hỗ trợ quản lý sản phẩm, đơn hàng, người dùng, chatbot AI (OpenAI/Gemini), phân quyền admin/user, đồng bộ kho, trạng thái đơn hàng, và bảo mật.

## Công nghệ sử dụng
- Node.js, Express.js
- MongoDB (Atlas)
- TypeScript
- JWT Auth, Helmet, CORS
- OpenAI/Gemini API (chatbot)

## Cài đặt & phát triển local
```bash
yarn install
# hoặc npm install
```

### Tạo file `.env` (hoặc `.env.production` khi deploy)
```env
PORT=4000
SECRET_KEY_JWT=your_jwt_secret
USERNAME_DB=your_mongodb_user
PASSWORD_DB=your_mongodb_password
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
AI_PROVIDER=gemini # hoặc openai
```

## Chạy local
```bash
yarn build # build typescript
node build/index.js # hoặc yarn start nếu dùng ts-node
```

## Build & Deploy lên Render
1. **Push code lên GitHub**
2. **Tạo Web Service trên [Render](https://dashboard.render.com/)**
3. **Thiết lập biến môi trường** (Environment Variables) trên Render dashboard (không commit file .env lên GitHub)
4. **Build command:**
   - `yarn build` hoặc `npm run build`
5. **Start command:**
   - `node build/index.js` hoặc `yarn start` (nếu đã build ra build/index.js)
6. **Kết nối MongoDB Atlas** (lấy connection string, điền vào biến môi trường)

## Lưu ý khi deploy production
- **Không dùng URL localhost cho ảnh:**
  - FE cần lấy ảnh từ: `https://<PRODUCTION_HOST>/images/<imgSrc>`
  - Ví dụ: `src={`https://your-app.onrender.com/images/${imgSrc}`}`
- **Không commit file .env lên GitHub** (đã có trong .gitignore)
- **Bảo mật các key (OPENAI_API_KEY, SECRET_KEY_JWT, ...)** chỉ cấu hình trên Render dashboard.
- **Sau khi sửa code, chỉ cần push lên GitHub, Render sẽ tự động build & deploy lại.**

## API chính
- `/admin/*`: Quản trị (cần quyền admin)
- `/user/*`: Người dùng
- `/products`, `/categories`, `/orders`, `/purchases`, ...
- `/chatbot`: Chatbot AI

## Đóng góp & phát triển
- Đọc kỹ README và code mẫu để mở rộng nghiệp vụ.

---
**© 2024 E-Commerce API**
