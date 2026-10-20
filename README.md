# MỘC THƯ — BẢN VERCEL + NEON 📚

Đây là **phiên bản dành cho GitHub + Vercel**, không dùng `server.js` và **không lưu sách bằng file JSON trên Vercel**. Sách được lưu bền vững trong **Neon Postgres** nên khi tắt trình duyệt, quay lại, đổi máy hoặc cập nhật/deploy lại website, sách vẫn tồn tại **miễn là website kết nối tới cùng database và dữ liệu database chưa bị xóa**.

> Lưu ý: tên người dùng / mật khẩu mặc định KHÔNG nằm trong code triển khai. Hãy thêm biến môi trường tại Vercel. Tên `nap213` được phép, nhưng **đừng dùng `nap213` làm mật khẩu trên web công khai**, vì rất dễ bị người khác đoán.

## 1. Upload lên GitHub (không cần gõ lệnh)

1. Tải file ZIP, **giải nén** ra một thư mục trên máy.
2. Mở https://github.com/new, đặt tên repository ví dụ `moc-thu`, chọn Private hoặc Public, nhấn **Create repository**.
3. Tại trang repository mới, chọn **uploading an existing file** (hoặc Add file → Upload files).
4. Kéo **toàn bộ các file/thư mục bên trong thư mục đã giải nén** lên (đặc biệt là `public/`, `api/`, `lib/`, `package.json`, `vercel.json`). Không upload nguyên file `.zip` và không bỏ hết vào một thư mục con.
5. Nhấn **Commit changes**. Kiểm tra repository có các thư mục `public`, `api`, `lib` ở ngay cấp ngoài cùng.

Nếu trình duyệt không nhận kéo-thả folder, dùng GitHub Desktop (File → Add local repository → Publish repository) hoặc Git CLI.

## 2. Kết nối Vercel

1. Vào https://vercel.com/new, đăng nhập bằng GitHub.
2. Chọn **Import Git Repository** → repository `moc-thu` → Import.
3. Đặt Project Name `moc-thu` hoặc tên tùy ý.
4. **Framework Preset: Other**. **Root Directory: `./`** (repo root). **Build Command: để trống**, không nhập `npm start`/`node server.js`. **Output Directory: mặc định `public`**.
5. Nhấn Deploy để tạo project. Lần deploy đầu có thể chưa tải được sách vì chưa gắn database; hoàn tất bước 3 rồi Redeploy.

## 3. Thêm database Neon cho dữ liệu sách

1. Vào project trên Vercel → tab **Storage** hoặc **Marketplace** → **Create Database** → chọn **Neon Postgres**.
2. Chọn gói phù hợp (có thể là Free), tên database và vùng máy chủ.
3. **Connect/Link** database Neon với **chính project** `moc-thu` và môi trường **Production**. Kiểm tra ở Vercel Project → Settings → Environment Variables có biến `DATABASE_URL` được Neon thêm vào.
4. Nếu không có `DATABASE_URL`, hãy nối lại integration (hoặc thêm thủ công chuỗi kết nối Neon vào env `DATABASE_URL`; KHÔNG đưa chuỗi này lên GitHub).
5. **Không cần tạo bảng bằng SQL**: API sẽ tự tạo bảng `mocthu_library` lần đầu được gọi; có sẵn 3 cuốn sách ví dụ để thử.

Vercel hiện kết nối Postgres thông qua Marketplace; không tìm “Vercel Postgres” cũ.

## 4. Cấu hình mật khẩu admin

Trong Vercel Project → **Settings → Environment Variables**, thêm các biến sau vào **Production**:

| Name | Value (ví dụ) |
|------|---------------|
| `ADMIN_USER` | `nap213` |
| `ADMIN_PASS` | **Mật khẩu riêng rất mạnh**, không nên đặt `nap213` khi public |
| `SESSION_SECRET` | Chuỗi ngẫu nhiên khó đoán, dài **ít nhất 32 ký tự** (ví dụ generate bằng password manager / `openssl rand -hex 32`) |
| `DATABASE_URL` | Neon tạo tự động — không cần thêm lần nữa nếu đã có |

Để dùng đúng tài khoản demo cũ, có thể tạm đặt `ADMIN_PASS=nap213` lúc thử, nhưng **hãy đổi trước khi gửi link public**. Tuyệt đối không chia sẻ mật khẩu database hoặc `SESSION_SECRET`.

## 5. Redeploy + kiểm tra

1. Vercel → Project → **Deployments** → với deployment mới nhất chọn **Redeploy** (hoặc commit thay đổi lên GitHub để tạo deploy mới).
2. Mở `https://ten-du-an.vercel.app/api/session`. Kết quả phải tương tự `{"server":true,"admin":false}`.
3. Mở `https://ten-du-an.vercel.app/api/books`. Kết quả là JSON có `books` và 3 cuốn ví dụ. Nếu báo lỗi DATABASE_URL thì xem lại bước 3.
4. Mở trang chính. Chọn **Đăng nhập Admin**, đăng nhập bằng `ADMIN_USER` + `ADMIN_PASS` đã thiết lập → **Thêm sách** → dán nội dung → lưu.
5. Đóng tab, mở lại bằng trình duyệt hoặc thiết bị khác: sách vừa tạo vẫn nằm trong thư viện chung.
6. Mở chế độ ẩn danh/điện thoại để xác minh độc giả không cần đăng nhập vẫn đọc được.

## Cấu trúc project

```text
public/index.html           giao diện Mộc Thư (lật trang, tối/sáng, chỉnh cỡ chữ)
api/session.js              kiểm tra phiên admin
api/login.js                đăng nhập admin
api/logout.js               đăng xuất admin
api/books.js                lấy/lưu thư viện sách qua Neon
lib/shared.js               kết nối DB, đăng nhập & kiểm tra dữ liệu
lib/seed.js                 3 cuốn sách mẫu chỉ seed một lần
package.json                thư viện Neon được Vercel tự cài
vercel.json                 cấu hình Vercel Function
.env.example                danh sách tên biến (KHÔNG chứa secrets thật)
```

## Câu hỏi thường gặp

- **Sách có bị mất khi tắt web không?** Không. Dữ liệu nằm ở Neon Postgres, không phải RAM của Vercel hay localStorage của admin.
- **Khi đổi code trên GitHub, sách có mất không?** Không, miễn là vẫn dùng cùng `DATABASE_URL` và không xóa database.
- **Khi xóa cache trình duyệt?** Nội dung sách không mất. Tuy nhiên trang đang đọc và chế độ màu là cài đặt cá nhân lưu ở `localStorage`, có thể mất nếu xóa dữ liệu trình duyệt.
- **Vercel hiện lỗi 500 / không thấy sách?** Kiểm tra `DATABASE_URL`, logs trong Vercel Functions, Neon đang hoạt động, Redeploy sau khi cập nhật env.
- **Đăng nhập thất bại?** Đối chiếu `ADMIN_USER`, `ADMIN_PASS`, `SESSION_SECRET`, kiểm tra ở môi trường Production, Redeploy.
- **Đã tạo sách nhưng không thấy ở link Preview?** Nếu Neon tự tạo nhánh DB riêng cho Preview, nội dung của nhánh Preview và Production có thể khác nhau. Hãy test trên URL Production.
- **Có giới hạn độ dài không?** Có. API hiện gửi cả thư viện trong một lần tải/lưu: tổng dữ liệu sách phải < khoảng 3,5 MB và mỗi sách < khoảng 2,5 MB. Vercel Functions có giới hạn payload 4,5 MB. Với thư viện quá lớn cần nâng cấp mô hình API tải/lưu từng sách riêng.
- **Có an toàn khi dùng `nap213/nap213`?** Không. Đó là mật khẩu demo. Đổi thành mật khẩu mạnh ngay khi đưa web lên Internet.
- **Có lưu dữ liệu mãi mãi không?** Sẽ lưu qua các lần deploy và đóng/mở trình duyệt, nhưng vẫn phụ thuộc vào tài khoản, gói dịch vụ và tình trạng của Neon. Nên sao lưu bằng chức năng **Xuất toàn bộ sách (JSON)** trong trang admin.

## Nguồn chính thức

- https://vercel.com/docs/git/vercel-for-github
- https://vercel.com/docs/marketplace-storage
- https://vercel.com/marketplace/neon
- https://vercel.com/docs/functions/runtimes/node-js
- https://vercel.com/docs/functions/limitations
