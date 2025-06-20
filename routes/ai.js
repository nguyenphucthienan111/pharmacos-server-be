const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authenticateToken } = require("../middleware/auth");
const AISearch = require("../models/AIModels");
const Product = require("../models/Product");
const { searchProductByImage } = require("../utils/geminiClient");

// Cấu hình multer để lưu file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/ai-search";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB
  fileFilter: fileFilter,
});

/**
 * @swagger
 * /api/ai/search-by-image:
 *   post:
 *     summary: Tìm kiếm sản phẩm bằng hình ảnh sử dụng Google Gemini AI
 *     tags: [AI Features]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: File hình ảnh (jpg, jpeg, png) tối đa 5MB
 *     responses:
 *       200:
 *         description: Tìm kiếm thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 geminiAnalysis:
 *                   type: string
 *                   description: Kết quả phân tích hình ảnh từ Gemini
 *                 matchedProducts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *                 message:
 *                   type: string
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi server
 */
router.post(
  "/search-by-image",
  authenticateToken,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            "Vui lòng upload file hình ảnh đúng định dạng (jpg, jpeg, png) và dung lượng không quá 5MB",
        });
      }

      // Đọc file hình ảnh
      const imageBuffer = fs.readFileSync(req.file.path);

      // Gọi Gemini API để phân tích hình ảnh
      const geminiResult = await searchProductByImage(
        imageBuffer,
        req.file.mimetype
      );

      // Xử lý kết quả từ Gemini để tạo từ khóa tìm kiếm
      const searchKeywords = geminiResult
        .toLowerCase()
        .split(/[\s,\.]+/) // Tách theo khoảng trắng, dấu phẩy hoặc dấu chấm
        .filter((word) => word.length > 2) // Chỉ lấy các từ có độ dài > 2
        .map((word) =>
          word.replace(
            /[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g,
            ""
          )
        ); // Loại bỏ ký tự đặc biệt

      // Tìm kiếm sản phẩm trong database dựa trên từ khóa
      const searchRegexes = searchKeywords.map(
        (keyword) => new RegExp(keyword, "i")
      );
      const matchedProducts = await Product.find({
        $or: [
          { name: { $in: searchRegexes } },
          { description: { $in: searchRegexes } },
        ],
      });

      // Lưu kết quả tìm kiếm
      const aiSearch = new AISearch({
        userId: req.user._id,
        imageUrl: req.file.path,
        geminiResult: geminiResult,
        matchedProducts: matchedProducts.map((p) => p._id),
      });
      await aiSearch.save();

      // Trả về kết quả
      res.json({
        success: true,
        geminiAnalysis: geminiResult,
        matchedProducts: matchedProducts,
        message:
          matchedProducts.length > 0
            ? "Đã tìm thấy sản phẩm phù hợp"
            : "Không tìm thấy sản phẩm phù hợp trong cửa hàng",
      });
    } catch (error) {
      console.error("Lỗi khi tìm kiếm:", error);
      res.status(500).json({
        success: false,
        message: "Đã xảy ra lỗi khi tìm kiếm sản phẩm",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/ai/search-history:
 *   get:
 *     summary: Lấy lịch sử tìm kiếm bằng AI
 *     tags: [AI Features]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy lịch sử thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 history:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AISearch'
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi server
 */
router.get("/search-history", authenticateToken, async (req, res) => {
  try {
    const searchHistory = await AISearch.find({ userId: req.user._id })
      .populate("matchedProducts")
      .sort({ searchedAt: -1 });

    res.json({
      success: true,
      history: searchHistory,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Đã xảy ra lỗi khi lấy lịch sử tìm kiếm",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     AISearch:
 *       type: object
 *       properties:
 *         userId:
 *           type: string
 *           description: ID của người dùng thực hiện tìm kiếm
 *         imageUrl:
 *           type: string
 *           description: Đường dẫn lưu hình ảnh đã upload
 *         geminiResult:
 *           type: string
 *           description: Kết quả phân tích từ Gemini AI
 *         matchedProducts:
 *           type: array
 *           items:
 *             type: string
 *           description: Danh sách ID các sản phẩm phù hợp
 *         searchedAt:
 *           type: string
 *           format: date-time
 *           description: Thời gian tìm kiếm
 */

module.exports = router;
