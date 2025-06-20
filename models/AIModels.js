const mongoose = require("mongoose");

const AISearchSchema = new mongoose.Schema({
  // Người dùng thực hiện tìm kiếm
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true,
  },
  // Đường dẫn lưu hình ảnh đã upload
  imageUrl: {
    type: String,
    required: true,
  },
  // Kết quả phân tích từ Gemini
  geminiResult: {
    type: String,
    required: true,
  },
  // Các sản phẩm được tìm thấy
  matchedProducts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
  ],
  // Thời gian tìm kiếm
  searchedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("AISearch", AISearchSchema);
