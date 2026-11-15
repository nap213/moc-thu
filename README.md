# Mộc Thư — Audiobook lưu trên máy chủ (bản tích hợp 2026)

Bộ source cho **GitHub → Vercel + Neon + Vercel Blob + Gemini Flash TTS**. Giữ nguyên trang đọc sách, đăng nhập Admin và database sách cũ; thay khu vực TTS thử nghiệm bằng trình phát audiobook.

## Các chức năng

- Người đọc: phát / tạm dừng, tua ±15 giây, kéo thanh thời gian, tốc độ 0.75×–2×.
- Admin: upload một file MP3/WAV có sẵn cho mỗi cuốn, hoặc bấm **Tạo giọng cho toàn sách**. Một file upload có thể lớn hơn 4,5 MB vì được đẩy trực tiếp từ trình duyệt tới Vercel Blob.
- Gemini: sách được chia thành các đoạn khoảng 800 ký tự và tạo lần lượt. **Mỗi đoạn WAV được lưu vào Blob ngay** và metadata được ghi vào Neon. Nếu lỗi/hết quota hoặc đóng tab, những đoạn đã tạo vẫn còn, admin mở lại sách và bấm tạo để tiếp tục.
- Khi audio sẵn sàng, người đọc chỉ thấy trình phát, không thấy form tạo giọng hoặc upload.
- Tiến độ nghe: được ghi vào Neon theo **ID ẩn danh của thiết bị/trình duyệt**, sao lưu trong localStorage. Có thể khôi phục khi mở lại cùng trình duyệt. Chuyển máy hoặc xóa dữ liệu trình duyệt sẽ mất ID thiết bị cũ.
- Sách do Gemini tạo là **danh sách nhiều file WAV**, phát nối tiếp; file upload là **một MP3/WAV liên tục**. Với iPhone khóa màn hình, MP3 upload ổn định hơn; Safari có thể ngừng tự chuyển giữa các đoạn WAV. Không thể cam kết phát nền hoàn toàn.

## 1. Sao lưu trước khi cập nhật

Trước khi thay source, mở Mộc Thư → đăng nhập admin → xuất thư viện JSON làm bản sao. Trong GitHub tạo một branch/commit dự phòng. **Không xóa Neon database** hiện tại.

## 2. Tạo Vercel Blob store

1. Vào Vercel → project Mộc Thư → **Storage** → **Create Database** → **Blob**.
2. Chọn **Public** (vì sách này được phép nghe công khai) và liên kết store với project, môi trường Production.
3. Vercel tự cấp biến `BLOB_READ_WRITE_TOKEN` cho project. Không đưa token vào GitHub.
4. Đừng chọn Private để dùng thẳng file URL từ audio player, vì cần một API proxy và xác thực riêng.

Hobby hiện được bao gồm hạn mức 1 GB storage, 10 GB data transfer/tháng và hạn mức operations. WAV không nén nên truyện dài sẽ tốn dung lượng nhanh.

## 3. Cấu hình Vercel Environment Variables

Giữ các biến **cũ**:
- `DATABASE_URL` (Neon)
- `ADMIN_USER`
- `ADMIN_PASS`
- `SESSION_SECRET` (ít nhất 32 ký tự)

Thêm/giữ:
- `GEMINI_API_KEY` (lấy từ https://aistudio.google.com/api-keys) — chỉ cần để dùng Gemini; upload MP3 không cần.
- `BLOB_READ_WRITE_TOKEN` (Vercel Blob tự thêm khi liên kết store).

**Đừng chia sẻ API key/token trong chat hoặc commit lên GitHub.**

## 4. Upload source và deploy

Giải nén ZIP và đưa **toàn bộ nội dung** vào thư mục gốc repository `moc-thu` (không upload nguyên file ZIP). Giữ đúng:

```
api/audio.js
api/audio-progress.js
api/audio-upload.js
api/books.js
lib/audio.js
lib/shared.js
public/index.html
public/audio-upload-client.js
package.json
vercel.json
```

Repo cũng chứa các file API cũ. `npm install` được Vercel tự chạy khi deploy. `package.json` thêm `@vercel/blob`.

**Lưu ý:** file `public/audio-upload-client.js` tải SDK trong trình duyệt từ `esm.sh`. Nếu mạng của admin chặn esm.sh, upload sẽ không hoạt động; cần bundle thư viện `@vercel/blob/client` vào dự án bằng công cụ build.

Vercel → Project → Deployments → chọn deploy mới. Kiểm tra logs nếu lỗi và dùng **Redeploy** sau khi thêm biến môi trường.

## 5. Sử dụng

1. Mở web → đăng nhập Admin → chọn một cuốn.
2. Kéo xuống **Sách nói Mộc Thư**, mở **Quản lý audio (chỉ Admin)**.
3. **Nhanh và đáng tin cậy nhất:** chọn MP3 hoặc WAV, nhấn **Tải audio lên**. Tối đa 200 MB/file theo giới hạn ứng dụng này. MP3 là lựa chọn tốt cho iPhone và giảm dung lượng lưu trữ.
4. **Gemini:** nhấn **Tạo giọng cho toàn sách**, giữ tab mở cho đến khi hoàn tất. Khi hết quota / timeout, có thể bấm lại ngày hôm sau để tiếp tục. Mỗi request có timeout ~54 giây; hệ thống bảo vệ giới hạn 40 đoạn/ngày. Google có thể áp giới hạn thấp hơn.
5. Thoát Admin rồi mở lại sách bằng điện thoại; giờ chỉ còn trình phát và việc nghe không kích hoạt tạo lại âm thanh.
6. Đang nghe dở, nhấn Pause hoặc đóng tab. Tiến độ tự lưu mỗi ~12 giây và vào thời điểm thoát/ẩn tab, đồng thời lưu trên Neon. Sau đó mở lại trên **cùng trình duyệt** để tiếp tục.

## Điều kiện và hạn chế kỹ thuật

- Tạo hàng trăm đoạn Gemini tốn rất nhiều request, dung lượng WAV và có thể vượt mức Free Tier. Chỉ nên thử trước với sách ngắn; với tiểu thuyết dài nên tạo MP3 bên ngoài rồi upload.
- Chưa có worker xử lý nền chuyên dụng. Khi tạo Gemini **phải giữ trang Admin mở**; đóng trình duyệt dừng vòng lặp gửi đoạn mới, nhưng không làm mất các đoạn đã tạo. Muốn tiếp tục hoàn toàn tự động sau khi đóng trang cần thêm job queue/worker.
- Không ghép mọi đoạn Gemini thành **một** file MP3; phiên bản này phát playlist WAV nối tiếp. Việc tự phát đoạn tiếp theo khi iOS đã khóa màn hình không được bảo đảm. Muốn phát xuyên suốt ổn định nên upload **một MP3**.
- Với cập nhật văn bản sách, audio Gemini cũ bị đánh dấu `stale` và không phát tới khi admin tạo lại. MP3 đã upload vẫn được giữ nguyên cho tới khi thay file.
- File audio cũ bị thay thế không bị tự động xóa khỏi Blob store: admin nên dọn thủ công tại Vercel Blob khi cần tránh hao dung lượng.
- Nội dung sách gửi Gemini Free Tier có thể chịu quy định sử dụng dữ liệu để cải thiện sản phẩm của Google.
- Tiến độ gắn với ID thiết bị ẩn danh trong localStorage, **không đồng bộ giữa các thiết bị**. Có thể đọc tiếp sau khi đóng web, miễn dữ liệu trình duyệt không bị xóa.
- Không thể kiểm tra cuộc gọi Gemini/Neon/Blob thực tế khi chưa có thông tin kết nối của project.
