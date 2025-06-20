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

// Helper function để trích xuất thông tin sản phẩm từ kết quả Gemini
function extractProductInfo(geminiText) {
  let productInfo = {
    brand: "",
    name: "",
    type: "",
  };

  // Chuyển text về lowercase để dễ so sánh
  const text = geminiText.toLowerCase();

  // Tìm brand name trong dấu **
  const brandMatch = text.match(/\*\*(.*?)\*\*/);
  if (brandMatch) {
    const fullName = brandMatch[1].toLowerCase();

    // Tìm thương hiệu
    const brands = ["image", "the ordinary", "vital", "chanel", "gucci"];
    const foundBrand = brands.find((brand) => fullName.includes(brand));
    if (foundBrand) {
      productInfo.brand = foundBrand;
    }

    // Lưu tên sản phẩm đầy đủ
    productInfo.name = fullName;
  }

  // Xác định loại sản phẩm
  if (text.includes("serum")) productInfo.type = "serum";
  else if (text.includes("cream")) productInfo.type = "cream";
  else if (text.includes("moisturizer")) productInfo.type = "moisturizer";

  return productInfo;
}

// Helper function để so khớp sản phẩm
function matchProduct(productInfo, dbProduct) {
  // Nếu không có thông tin sản phẩm, không match
  if (!productInfo.name) return false;

  const productName = dbProduct.name.toLowerCase();
  const productDesc = dbProduct.description.toLowerCase();
  const productImages = dbProduct.images.map((img) => img.url.toLowerCase());

  // Kiểm tra tên sản phẩm và mô tả
  const nameMatch = productInfo.name
    .split(" ")
    .some(
      (word) =>
        word.length > 3 &&
        (productName.includes(word) || productDesc.includes(word))
    );

  // Kiểm tra URL hình ảnh
  const imageMatch = productImages.some((url) => {
    const urlParts = url.split(/[-_.]/).map((part) => part.toLowerCase());
    return urlParts.some((part) => productInfo.name.includes(part));
  });

  // Trả về true nếu match cả tên và hình ảnh
  return nameMatch && imageMatch;
}

/**
 * @swagger
 * tags:
 *   name: AI Features
 *   description: Các chức năng AI sử dụng Google Gemini
 */

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
 *                   example: false
 *                   description: true nếu tìm thấy sản phẩm, false nếu không tìm thấy
 *                 geminiAnalysis:
 *                   type: string
 *                   description: Kết quả phân tích hình ảnh từ Gemini
 *                 matchedProducts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *                   description: Danh sách sản phẩm phù hợp
 *                 message:
 *                   type: string
 *                   description: Thông báo kết quả tìm kiếm
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

      // Trích xuất thông tin sản phẩm từ kết quả Gemini
      const productInfo = extractProductInfo(geminiResult);
      console.log("Product info from Gemini:", productInfo);

      // Tìm kiếm sản phẩm trong database
      const products = await Product.find();

      // Lọc sản phẩm phù hợp
      const matchedProducts = products.filter((product) =>
        matchProduct(productInfo, product)
      );

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
        success: matchedProducts.length > 0,
        geminiAnalysis: geminiResult,
        matchedProducts: matchedProducts,
        message:
          matchedProducts.length > 0
            ? "Đã tìm thấy sản phẩm phù hợp"
            : "No matching products found",
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

module.exports = router;
