const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
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
    ingredients: [],
    benefits: [],
    features: [],
  };

  const text = geminiText.toLowerCase();

  // Tìm tên và thương hiệu
  const brandMatch = text.match(/\*\*(.*?)\*\*/);
  if (brandMatch) {
    const fullName = brandMatch[1].toLowerCase();
    productInfo.name = fullName;

    // Tìm thương hiệu
    const brands = [
      "balance active formula",
      "the ordinary",
      "vital",
      "chanel",
      "la roche posay",
      "cerave",
    ];
    const foundBrand = brands.find((brand) => fullName.includes(brand));
    if (foundBrand) {
      productInfo.brand = foundBrand;
    }
  }

  // Xác định loại sản phẩm
  const productTypes = {
    serum: ["serum", "sérum"],
    cream: ["cream", "kem"],
    moisturizer: ["moisturizer", "dưỡng ẩm"],
    cleanser: ["cleanser", "sữa rửa mặt"],
    toner: ["toner", "nước hoa hồng"],
  };

  for (const [type, keywords] of Object.entries(productTypes)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      productInfo.type = type;
      break;
    }
  }

  // Tìm thành phần
  const commonIngredients = [
    "vitamin c",
    "vitamin e",
    "retinol",
    "hyaluronic acid",
    "niacinamide",
    "peptide",
    "collagen",
    "aha",
    "bha",
    "glycolic acid",
    "salicylic acid",
  ];

  productInfo.ingredients = commonIngredients.filter((ingredient) =>
    text.includes(ingredient)
  );

  // Tìm công dụng
  const commonBenefits = [
    "brightening",
    "làm sáng",
    "chống lão hóa",
    "anti-aging",
    "hydrating",
    "dưỡng ẩm",
    "trị mụn",
    "acne",
  ];

  productInfo.benefits = commonBenefits.filter((benefit) =>
    text.includes(benefit)
  );

  // Tìm đặc tính
  const commonFeatures = [
    "lightweight",
    "nhẹ nhàng",
    "non-comedogenic",
    "không gây bít tắc",
    "fragrance-free",
    "không mùi",
    "gentle",
    "dịu nhẹ",
  ];

  productInfo.features = commonFeatures.filter((feature) =>
    text.includes(feature)
  );

  return productInfo;
}

function matchProduct(productInfo, dbProduct) {
  if (!productInfo.name) return { match: false, score: 0 };

  let score = 0;
  const maxScore = 100;

  // So khớp tên và mô tả (30 điểm)
  const productName = dbProduct.name.toLowerCase();
  const productDesc = dbProduct.description.toLowerCase();
  const nameWords = productInfo.name.split(" ");
  const nameMatchCount = nameWords.filter(
    (word) =>
      word.length > 3 &&
      (productName.includes(word) || productDesc.includes(word))
  ).length;
  score += (nameMatchCount / nameWords.length) * 30;

  // So khớp thương hiệu (20 điểm)
  if (
    productInfo.brand &&
    dbProduct.brand.some((b) => b.toLowerCase().includes(productInfo.brand))
  ) {
    score += 20;
  }

  // So khớp loại sản phẩm (10 điểm)
  if (
    productInfo.type &&
    dbProduct.subcategory &&
    dbProduct.subcategory.toLowerCase() === productInfo.type
  ) {
    score += 10;
  }

  // So khớp thành phần (20 điểm)
  if (productInfo.ingredients.length > 0 && dbProduct.ingredients) {
    const matchedIngredients = productInfo.ingredients.filter((ingredient) =>
      dbProduct.ingredients.some((i) =>
        i.name.toLowerCase().includes(ingredient)
      )
    );
    score += (matchedIngredients.length / productInfo.ingredients.length) * 20;
  }

  // So khớp công dụng và đặc tính (20 điểm)
  const allFeatures = [...dbProduct.benefits, ...dbProduct.features].map((f) =>
    f.toLowerCase()
  );
  const matchedFeatures = [
    ...productInfo.benefits,
    ...productInfo.features,
  ].filter((f) => allFeatures.some((dbf) => dbf.includes(f)));

  if (matchedFeatures.length > 0) {
    score +=
      (matchedFeatures.length /
        (productInfo.benefits.length + productInfo.features.length)) *
      20;
  }

  // Trả về kết quả với điểm số
  return {
    match: score >= 40, // Chỉ match khi đạt ít nhất 40 điểm
    score: Math.round(score),
  };
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
 *     description: Upload hình ảnh sản phẩm để tìm kiếm sản phẩm tương tự trong shop
 *     tags: [AI Features]
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
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 *       500:
 *         description: Lỗi server
 */
router.post("/search-by-image", upload.single("image"), async (req, res) => {
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
    // Lọc và sắp xếp sản phẩm theo điểm số
    const matchedProducts = products
      .map((product) => ({
        product,
        matchResult: matchProduct(productInfo, product),
      }))
      .filter((item) => item.matchResult.match)
      .sort((a, b) => b.matchResult.score - a.matchResult.score)
      .map((item) => ({
        ...item.product.toObject(),
        matchScore: item.matchResult.score,
      }));

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
});

module.exports = router;
