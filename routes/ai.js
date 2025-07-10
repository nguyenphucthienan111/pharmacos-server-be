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

  console.log(`🔍 Raw Gemini text for extraction:`);
  console.log(geminiText);
  console.log(`========================`);

  const text = geminiText.toLowerCase();

  // Tìm tên sản phẩm với nhiều cách khác nhau
  let productNameMatch = null;

  // Cách 1: Handle double asterisks - "**Product name:** **Product Name**"
  productNameMatch = text.match(
    /\*\*product\s*name[:\s]*\*\*\s*\*\*([^*]+)\*\*/i
  );

  // Cách 2: Single asterisks - "**Product name: Product Name**"
  if (!productNameMatch) {
    productNameMatch = text.match(/\*\*product\s*name[:\s]*([^*]+)\*\*/i);
  }

  // Cách 3: Tìm pattern "product name" followed by bold text
  if (!productNameMatch) {
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.includes("product name")) {
        const boldMatch = line.match(/\*\*([^*]+)\*\*/g);
        if (boldMatch && boldMatch.length > 0) {
          // Lấy bold text cuối cùng trong dòng (thường là product name)
          const lastBold = boldMatch[boldMatch.length - 1];
          const content = lastBold.replace(/\*\*/g, "").trim();
          if (content && !content.toLowerCase().includes("product name")) {
            productNameMatch = [null, content];
            break;
          }
        }
      }
    }
  }

  if (productNameMatch) {
    productInfo.name = productNameMatch[1].trim().toLowerCase();
    console.log(`✅ Extracted product name: "${productInfo.name}"`);
  } else {
    // Fallback: tìm text in đậm dài nhất (thường là product name)
    const allBoldMatches = text.match(/\*\*([^*]+)\*\*/g);
    console.log(`🔍 All bold matches found:`, allBoldMatches);

    if (allBoldMatches && allBoldMatches.length > 0) {
      // Tìm match dài nhất (thường là product name)
      let longestMatch = "";
      allBoldMatches.forEach((match) => {
        const content = match.replace(/\*\*/g, "").trim();
        if (
          content.length > longestMatch.length &&
          !content.toLowerCase().includes("brand name")
        ) {
          longestMatch = content;
        }
      });

      if (longestMatch) {
        productInfo.name = longestMatch.toLowerCase();
        console.log(
          `⚠️ Fallback extracted longest name: "${productInfo.name}"`
        );
      }
    }
  }

  // Tìm thương hiệu trong toàn bộ text (không chỉ trong tên)
  const brands = [
    "balance active formula",
    "the ordinary",
    "vital",
    "chanel",
    "la roche posay",
    "cerave",
    "gucci",
    "gucci beauty",
    "dior",
    "ysl",
    "lancome",
    "estee lauder",
    "clinique",
    "mac",
    "maybelline",
    "l'oreal",
    "revlon",
    "benefit",
    "too faced",
    "urban decay",
    "luomthom",
    "luomthom haircare",
    "luomthiom",
    "luomthiom haircare",
    "tresemme",
    "head & shoulders",
    "pantene",
    "herbal essences",
    "aussie",
    "schwarzkopf",
    "garnier",
  ];

  // Tìm brand trong toàn bộ text, không chỉ trong tên
  const foundBrand = brands.find((brand) => text.includes(brand));
  if (foundBrand) {
    productInfo.brand = foundBrand;
  }

  // Xác định loại sản phẩm (mở rộng cho makeup và hair care)
  const productTypes = {
    serum: ["serum", "sérum"],
    cream: ["cream", "kem"],
    moisturizer: ["moisturizer", "dưỡng ẩm"],
    cleanser: ["cleanser", "sữa rửa mặt"],
    toner: ["toner", "nước hoa hồng"],
    powder: ["powder", "phấn phủ", "phấn", "poudre"],
    foundation: ["foundation", "kem nền", "fond de teint"],
    lipstick: ["lipstick", "son môi", "rouge à lèvres"],
    mascara: ["mascara", "mascara"],
    eyeliner: ["eyeliner", "kẻ mắt"],
    eyeshadow: ["eyeshadow", "phấn mắt", "ombre à paupières"],
    blush: ["blush", "má hồng", "phấn má"],
    concealer: ["concealer", "che khuyết điểm"],
    highlighter: ["highlighter", "bắt sáng"],
    shampoo: ["shampoo", "dầu gội", "hair shampoo"],
    conditioner: ["conditioner", "dầu xả", "hair conditioner"],
    haircare: ["hair care", "chăm sóc tóc", "haircare"],
    hairoil: ["hair oil", "dầu dưỡng tóc"],
    hairmask: ["hair mask", "mặt nạ tóc"],
    hairspray: ["hair spray", "keo xịt tóc"],
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

  // Normalize text for better matching - xử lý ký tự đặc biệt
  const normalizeText = (text) => {
    return text
      .toLowerCase()
      .replace(/[°º№]/g, "") // Loại bỏ ký tự đặc biệt
      .replace(/\s+/g, " ") // Chuẩn hóa spaces
      .trim();
  };

  // So khớp tên và mô tả (enhanced scoring - 60 điểm)
  const productName = normalizeText(dbProduct.name);
  const productDesc = normalizeText(dbProduct.description || "");
  const searchName = normalizeText(productInfo.name);

  // Tách từ khóa thông minh hơn
  const nameWords = searchName
    .split(/[\s\-\.,]+/)
    .filter((word) => word.length > 1); // Đơn giản hóa - chỉ lọc words quá ngắn

  let nameMatchCount = 0;
  let exactMatches = 0;

  // Kiểm tra số sequence (n1, no1, etc.)
  const hasNumberMatch = searchName.match(/n\d+/) && productName.match(/n\d+/);
  if (hasNumberMatch) {
    const searchNumber = searchName.match(/n(\d+)/)?.[1];
    const productNumber = productName.match(/n(\d+)/)?.[1];
    if (searchNumber === productNumber) {
      score += 20; // Bonus lớn cho match số
      console.log(`Number match bonus: N°${searchNumber}`);
    }
  }

  for (const word of nameWords) {
    if (productName.includes(word) || productDesc.includes(word)) {
      nameMatchCount++;
      if (productName.includes(word)) {
        exactMatches++;
      }
    }
  }

  if (nameWords.length > 0) {
    const matchRatio = nameMatchCount / nameWords.length;
    const exactRatio = exactMatches / nameWords.length;

    // Tăng scoring cho name matching
    const baseNameScore = matchRatio * 45; // Tăng từ 40 lên 45
    const exactBonus = exactRatio * 25; // Tăng từ 15 lên 25
    score += baseNameScore + exactBonus;

    // Bonus thêm nếu match rate cao
    if (matchRatio >= 0.8) {
      score += 15; // High match bonus
    } else if (matchRatio >= 0.6) {
      score += 8; // Medium match bonus
    }
  }

  // So khớp thương hiệu (enhanced - 30 điểm)
  if (productInfo.brand && dbProduct.brand && Array.isArray(dbProduct.brand)) {
    let brandScore = 0;

    for (const dbBrand of dbProduct.brand) {
      const dbBrandNorm = normalizeText(dbBrand);
      const searchBrandNorm = normalizeText(productInfo.brand);

      // Exact brand match gets full points
      if (dbBrandNorm === searchBrandNorm) {
        brandScore = 30;
        break;
      }
      // Very close match (one contains the other)
      else if (
        dbBrandNorm.includes(searchBrandNorm) ||
        searchBrandNorm.includes(dbBrandNorm)
      ) {
        brandScore = Math.max(brandScore, 25); // Tăng từ 20 lên 25
      }
      // Partial word match - for "luomthom haircare" vs "luomthom"
      else {
        const dbWords = dbBrandNorm.split(/\s+/);
        const searchWords = searchBrandNorm.split(/\s+/);
        let commonWords = 0;

        for (const searchWord of searchWords) {
          if (
            dbWords.some(
              (dbWord) =>
                dbWord.includes(searchWord) || searchWord.includes(dbWord)
            )
          ) {
            commonWords++;
          }
        }

        if (commonWords > 0) {
          const wordMatchRatio =
            commonWords / Math.max(dbWords.length, searchWords.length);
          brandScore = Math.max(brandScore, Math.round(wordMatchRatio * 20)); // Up to 20 points for partial
        }
      }
    }

    score += brandScore;
  }

  // So khớp loại sản phẩm (15 điểm)
  if (productInfo.type) {
    const subcategory = normalizeText(dbProduct.subcategory || "");
    const category = normalizeText(dbProduct.category || "");
    const searchType = normalizeText(productInfo.type);

    if (subcategory === searchType || category === searchType) {
      score += 15; // Exact match - tăng từ 10 lên 15
    } else if (
      subcategory.includes(searchType) ||
      category.includes(searchType) ||
      searchType.includes(subcategory) ||
      searchType.includes(category)
    ) {
      score += 8; // Partial match - tăng từ 5 lên 8
    }
  }

  // Bonus điểm cho keywords trong tên sản phẩm (10 điểm)
  const productNameLower = normalizeText(dbProduct.name);
  const searchNameLower = normalizeText(productInfo.name);
  const keywords = searchNameLower
    .split(/\s+/)
    .filter((word) => word.length > 3);

  let keywordMatches = 0;
  for (const keyword of keywords) {
    if (productNameLower.includes(keyword)) {
      keywordMatches++;
    }
  }

  if (keywords.length > 0) {
    const keywordBonus = (keywordMatches / keywords.length) * 10;
    score += keywordBonus;

    if (keywordMatches > 0) {
      console.log(
        `🔍 Keyword bonus: ${Math.round(
          keywordBonus
        )} points (${keywordMatches}/${keywords.length} keywords: ${keywords
          .filter((kw) => productNameLower.includes(kw))
          .join(", ")})`
      );
    }
  }

  // Debug logging chi tiết cho tất cả matches > 35 điểm
  if (score > 35) {
    console.log(`\n=== DEBUG HIGH SCORE MATCH ===`);
    console.log(`Search: "${productInfo.name}" vs DB: "${dbProduct.name}"`);
    console.log(`Normalized search: "${searchName}"`);
    console.log(`Normalized product: "${productName}"`);
    console.log(`Words to match:`, nameWords);
    console.log(
      `Name matches: ${nameMatchCount}/${nameWords.length} (${Math.round(
        (nameMatchCount / nameWords.length) * 100
      )}%)`
    );
    console.log(
      `Exact matches: ${exactMatches}/${nameWords.length} (${Math.round(
        (exactMatches / nameWords.length) * 100
      )}%)`
    );
    console.log(
      `Brand: "${productInfo.brand}" vs [${dbProduct.brand?.join(", ")}]`
    );
    console.log(`Final score: ${Math.round(score)}`);
    console.log(`==============================\n`);
  }

  // Console log score breakdown cho debug
  if (
    dbProduct.name.toLowerCase().includes("chanel") ||
    dbProduct.name.toLowerCase().includes("luomthom") ||
    dbProduct.name.toLowerCase().includes("avocado") ||
    score > 30
  ) {
    console.log(`📊 SCORE BREAKDOWN: "${dbProduct.name}"`);
    console.log(`   📝 Search: "${productInfo.name}"`);
    console.log(
      `   🔤 Name score: ${Math.round(
        (nameMatchCount / nameWords.length) * 45 +
          (exactMatches / nameWords.length) * 25
      )} (${nameMatchCount}/${nameWords.length} matches)`
    );
    console.log(
      `   🏷️ Brand score: ${productInfo.brand ? "calculated above" : 0}`
    );
    console.log(`   📊 Total: ${Math.round(score)}/100`);
    console.log(`   ✅ Match: ${score >= 25}\n`);
  }

  // Trả về kết quả với điểm số
  return {
    match: score >= 25,
    score: Math.round(Math.min(score, 100)), // Cap tại 100
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

    // Gọi Gemini API để phân tích hình ảnh với retry logic
    let geminiResult;
    let isGeminiFailed = false;

    try {
      geminiResult = await searchProductByImage(imageBuffer, req.file.mimetype);

      // Check if this is a fallback response
      isGeminiFailed = geminiResult.includes("Product Analysis Failed");
    } catch (error) {
      console.error("Gemini API completely failed:", error);
      isGeminiFailed = true;
      geminiResult = `**Service Temporarily Unavailable**
      
      Our AI image analysis service is currently experiencing high demand.
      Please try again in a few minutes. 
      
      In the meantime, you can search for products using the search bar.`;
    }

    // Trích xuất thông tin sản phẩm từ kết quả Gemini
    let productInfo = {
      brand: "",
      name: "",
      type: "",
      ingredients: [],
      benefits: [],
      features: [],
    };
    let matchedProducts = [];

    if (!isGeminiFailed) {
      productInfo = extractProductInfo(geminiResult);
      console.log("Product info from Gemini:", productInfo);

      // Tìm kiếm sản phẩm trong database chỉ khi Gemini thành công
      const products = await Product.find();
      console.log(`Found ${products.length} products in database`);

      // Lọc và sắp xếp sản phẩm theo điểm số với debug
      const allMatchResults = products.map((product) => ({
        product,
        matchResult: matchProduct(productInfo, product),
      }));

      // Debug: log top 5 best matches
      const topMatches = allMatchResults
        .sort((a, b) => b.matchResult.score - a.matchResult.score)
        .slice(0, 5);

      console.log("Top 5 matches (debug):");
      topMatches.forEach((item, index) => {
        console.log(
          `${index + 1}. ${item.product.name} - Score: ${
            item.matchResult.score
          } - Match: ${item.matchResult.match}`
        );
      });

      matchedProducts = allMatchResults
        .filter((item) => item.matchResult.match)
        .sort((a, b) => b.matchResult.score - a.matchResult.score)
        .map((item) => ({
          ...item.product.toObject(),
          matchScore: item.matchResult.score,
        }));

      console.log(`${matchedProducts.length} products matched after filtering`);
    } else {
      console.log("Skipping product matching due to Gemini API failure");
    }

    console.log("Gemini analysis text:", geminiResult);
    console.log("Is Gemini failed:", isGeminiFailed);

    // Product matching logic has been moved above inside the !isGeminiFailed condition

    // Trả về kết quả với thông tin về Gemini status
    let message;
    if (isGeminiFailed) {
      message =
        "AI analysis service temporarily unavailable. Please try again later.";
    } else if (matchedProducts.length > 0) {
      message = "Found matching products based on AI analysis";
    } else {
      message = "No matching products found";
    }

    res.json({
      success: matchedProducts.length > 0,
      geminiAnalysis: geminiResult,
      matchedProducts: matchedProducts,
      message: message,
      aiServiceStatus: isGeminiFailed ? "unavailable" : "available",
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
