const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const ImageSearch = require("../models/AIModels");
const Order = require("../models/Order");
const OrderDetail = require("../models/OrderDetail");
const { authorize, authenticateToken } = require("../middleware/auth");

// Helper function to transform reviews for safe display
const transformReviewsForDisplay = (reviews) => {
  return reviews.map((review) => ({
    user: {
      username:
        review.userId?.name || review.userId?.username || "Anonymous User",
    },
    rating: review.rating,
    comment: review.comment,
    _id: review._id,
    createdAt: review.createdAt,
  }));
};

// Helper function to calculate average rating
const calculateAverageRating = (reviews) => {
  if (!reviews || reviews.length === 0) return 0;
  const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10; // Round to 1 decimal place
};

// Helper function to check if customer has purchased a product
const hasCustomerPurchasedProduct = async (customerId, productId) => {
  try {
    // Find completed/delivered orders by this customer
    const orders = await Order.find({
      customerId: customerId,
      status: { $in: ["completed", "delivered"] },
      paymentStatus: "success",
    });

    if (orders.length === 0) {
      return false;
    }

    // Check if any of these orders contain the specific product
    const orderIds = orders.map((order) => order._id);
    const orderDetail = await OrderDetail.findOne({
      orderId: { $in: orderIds },
      productId: productId,
    });

    return !!orderDetail;
  } catch (error) {
    console.error("Error checking purchase history:", error);
    return false;
  }
};

// Helper: auto sale 10% nếu gần hết hạn
function applyAutoSale(product) {
  if (!product.expiryDate) return product;
  const today = new Date();
  const expiry = new Date(product.expiryDate);
  if (isNaN(expiry.getTime())) return product;
  const diffDays = Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays <= 30) {
    // Nếu đã có salePrice nhỏ hơn 10% thì giữ nguyên
    const tenPercent = Math.round(product.price * 0.9);
    if (!product.salePrice || product.salePrice > tenPercent) {
      product.salePrice = tenPercent;
      product.isOnSale = true;
    }
  } else {
    // Hết thời gian sale tự động
    if (
      product.isOnSale &&
      product.salePrice === Math.round(product.price * 0.9)
    ) {
      product.isOnSale = false;
      product.salePrice = null;
    }
  }
  return product;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       required:
 *         - name
 *         - description
 *         - benefits
 *         - skinType
 *         - size
 *         - category
 *         - brand
 *         - price
 *         - instructions
 *       properties:
 *         _id:
 *           type: string
 *           description: Auto-generated MongoDB ID
 *         createdBy:
 *           type: string
 *           description: Reference to account who created the product
 *         isPopular:
 *           type: boolean
 *           description: Whether this is a popular/bestseller product
 *         subcategory:
 *           type: string
 *           description: Product subcategory
 *         name:
 *           type: string
 *           description: Product name
 *         description:
 *           type: string
 *           description: Detailed product description
 *         benefits:
 *           type: array
 *           items:
 *             type:  string
 *           description: List of product benefits
 *         skinType:
 *           type: array
 *           items:
 *             type: string
 *             enum: [oily, dry, combination, sensitive, normal, all]
 *           description: Suitable skin types
 *         size:
 *           type: string
 *           description: Product size/volume
 *         category:
 *           type: string
 *           description: Product category
 *         brand:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of brand names
 *         price:
 *           type: number
 *           minimum: 0
 *         stockQuantity:
 *           type: number
 *           minimum: 0
 *         ingredients:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               percentage:
 *                 type: number
 *               purpose:
 *                 type: string
 *         instructions:
 *           type: string
 *           description: How to use the product
 *         warnings:
 *           type: array
 *           items:
 *             type: string
 *           description: Side effects and warnings
 *         features:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of product features
 *         images:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 required: true
 *                 description: URL of the image
 *               alt:
 *                 type: string
 *                 description: Alternative text for the image
 *               isPrimary:
 *                 type: boolean
 *                 default: false
 *                 description: Whether this is the primary product image
 *         reviews:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *               createdAt:
 *                 type: string
 *                 format: date-time
 */

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *                 totalPages:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *                 total:
 *                   type: integer
 */
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const category = req.query.category;
    const subcategory = req.query.subcategory;
    const brand = req.query.brand;
    const minPrice = parseFloat(req.query.minPrice);
    const maxPrice = parseFloat(req.query.maxPrice);
    const sortBy = req.query.sortBy || "createdAt"; // default sort by creation date
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    // Build filter object
    const filter = {};
    if (category) filter.category = category.toLowerCase();
    if (subcategory) filter.subcategory = subcategory;
    if (brand) filter.brand = { $in: [brand] }; // Search for brand in the array
    if (!isNaN(minPrice) || !isNaN(maxPrice)) {
      filter.price = {};
      if (!isNaN(minPrice)) filter.price.$gte = minPrice;
      if (!isNaN(maxPrice)) filter.price.$lte = maxPrice;
    }

    // Create sort object
    const sort = {};
    sort[sortBy] = sortOrder;

    const products = await Product.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-__v");

    const total = await Product.countDocuments(filter);
    // Áp dụng auto sale cho từng sản phẩm
    const productsWithAutoSale = products.map((p) =>
      applyAutoSale(p.toObject ? p.toObject() : p)
    );
    res.json({
      success: true,
      data: {
        products: productsWithAutoSale,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          limit,
        },
        filters: {
          category,
          brand,
          price: {
            min: minPrice,
            max: maxPrice,
          },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching products",
      error: error.message,
    });
  }
});

// Route for popular products by category
router.get("/popular/:category?", async (req, res) => {
  try {
    const { category } = req.params;
    const filter = { isPopular: true };

    if (category) {
      filter.category = category.toLowerCase();
    }

    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .limit(category ? 2 : 8) // Show 2 popular products per category, or 8 if no category specified
      .select("-__v");

    res.json({
      success: true,
      data: {
        products,
      },
    });
  } catch (error) {
    console.error("Error fetching featured products:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching featured products",
      error: error.message,
    });
  }
});

// Route for searching products
router.get("/search", async (req, res) => {
  try {
    const { query, page = 1, limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const searchRegex = new RegExp(query, "i");
    const filter = {
      $or: [
        { name: searchRegex },
        { description: searchRegex },
        { brand: { $in: [searchRegex] } }, // Search for brand in the array
        { category: searchRegex },
        { benefits: searchRegex },
      ],
    };

    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-__v");

    const total = await Product.countDocuments(filter);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit),
        },
        searchQuery: query,
      },
    });
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).json({
      success: false,
      message: "Error searching products",
      error: error.message,
    });
  }
});

// Route for products by category
router.get("/category/:categoryName", async (req, res) => {
  try {
    const { categoryName } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const products = await Product.find({
      category: categoryName.toLowerCase(),
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-__v");

    const total = await Product.countDocuments({ category: categoryName });

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          limit,
        },
        category: categoryName,
      },
    });
  } catch (error) {
    console.error("Error fetching products by category:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching products by category",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get product by ID with similar products
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 product:
 *                   $ref: '#/components/schemas/Product'
 *                 similarProducts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       product:
 *                         $ref: '#/components/schemas/Product'
 *                       similarityScore:
 *                         type: number
 *       404:
 *         description: Product not found
 */
router.get("/:id", async (req, res) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    const product = await Product.findById(req.params.id)
      .populate("reviews.userId", "name email") // Populate review user details from Customer model
      .select("-__v"); // Exclude version field

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Transform reviews for safe display
    const transformedProduct = product.toObject();
    if (transformedProduct.reviews && transformedProduct.reviews.length > 0) {
      transformedProduct.reviews = transformReviewsForDisplay(
        transformedProduct.reviews
      );
    }

    // Áp dụng auto sale nếu gần hết hạn
    const productWithAutoSale = applyAutoSale(transformedProduct);

    // Tìm các sản phẩm có cùng subcategory
    const similarProducts = await Product.find({
      subcategory: product.subcategory,
      _id: { $ne: product._id }, // Loại trừ sản phẩm hiện tại
    })
      .limit(5)
      .select("-__v");

    res.json({
      success: true,
      data: {
        product: productWithAutoSale,
        similarProducts: similarProducts.map((p) => ({
          product: p,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching product details",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create new product (staff only)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - benefits
 *               - skinType
 *               - size
 *               - category
 *               - brand
 *               - price
 *               - instructions
 *               - manufacturingDate
 *               - expiryDate
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               subcategory:
 *                 type: string
 *               isPopular:
 *                 type: boolean
 *               benefits:
 *                 type: array
 *                 items:
 *                   type: string
 *               skinType:
 *                 type: array
 *                 items:
 *                   type: string
 *               size:
 *                 type: string
 *               brand:
 *                 type: array
 *                 items:
 *                   type: string
 *               price:
 *                 type: number
 *               stockQuantity:
 *                 type: number
 *               ingredients:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     percentage:
 *                       type: number
 *                     purpose:
 *                       type: string
 *               instructions:
 *                 type: string
 *               manufacturingDate:
 *                 type: string
 *                 format: date
 *                 description: Manufacturing date of the product
 *               expiryDate:
 *                 type: string
 *                 format: date
 *                 description: Expiry date of the product
 *               stockDate:
 *                 type: string
 *                 format: date
 *                 description: Date when product was added to stock (defaults to current date)
 *               warnings:
 *                 type: array
 *                 items:
 *                   type: string
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                     alt:
 *                       type: string
 *                     isPrimary:
 *                       type: boolean
 *           example:
 *             name: "Vitamin C Serum"
 *             description: "Serum vitamin C 20% giúp làm sáng da và chống lão hóa"
 *             manufacturingDate: "2025-01-01"
 *             expiryDate: "2027-01-01"
 *             category: "Skincare"
 *             subcategory: "serum"
 *             isPopular: true
 *             benefits: ["Brightening", "Anti-aging"]
 *             skinType: ["all"]
 *             size: "30ml"
 *             brand: ["The Ordinary", "CeraVe"]
 *             price: 299
 *             stockQuantity: 100
 *             ingredients: [
 *               {
 *                 "name": "Vitamin C",
 *                 "percentage": 20,
 *                 "purpose": "Antioxidant, brightening"
 *               }
 *             ]
 *             instructions: "Apply morning and night"
 *             warnings: ["May increase sun sensitivity"]
 *             features: [
 *               "antioxidant",
 *               "brightening",
 *               "moisturizing",
 *               "sensitive skin"
 *             ]
 *             images: [
 *               {
 *                 "url": "https://example.com/vitamin-c-main.jpg",
 *                 "alt": "Product front view",
 *                 "isPrimary": true
 *               },
 *               {
 *                 "url": "https://example.com/vitamin-c-side.jpg",
 *                 "alt": "Product side view"
 *               }
 *             ]
 *     responses:
 *       201:
 *         description: Product created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     category:
 *                       type: string
 *                     subcategory:
 *                       type: string
 *                     isPopular:
 *                       type: boolean
 *                     benefits:
 *                       type: array
 *                       items:
 *                         type: string
 *                     skinType:
 *                       type: array
 *                       items:
 *                         type: string
 *                     size:
 *                       type: string
 *                     price:
 *                       type: number
 *                     stockQuantity:
 *                       type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 */
router.post(
  "/",
  [authenticateToken, authorize(["staff"])],
  async (req, res) => {
    try {
      // Log the user object to debug
      console.log("Authenticated user:", req.user);

      if (!req.user || !req.user._id) {
        return res
          .status(401)
          .json({ message: "User authentication required" });
      }

      // Validate required date fields
      const { manufacturingDate, expiryDate, stockDate } = req.body;
      if (!manufacturingDate || !expiryDate) {
        return res.status(400).json({
          message: "Manufacturing date and expiry date are required",
        });
      }

      // Validate date formats and logic
      const mfgDate = new Date(manufacturingDate);
      const expDate = new Date(expiryDate);
      const stkDate = stockDate ? new Date(stockDate) : new Date();
      const today = new Date();

      if (
        isNaN(mfgDate.getTime()) ||
        isNaN(expDate.getTime()) ||
        (stockDate && isNaN(stkDate.getTime()))
      ) {
        return res.status(400).json({
          message: "Invalid date format. Use YYYY-MM-DD format",
        });
      }

      if (mfgDate > today) {
        return res.status(400).json({
          message: "Manufacturing date cannot be in the future",
        });
      }

      if (expDate <= mfgDate) {
        return res.status(400).json({
          message: "Expiry date must be after manufacturing date",
        });
      }

      if (stkDate > today) {
        return res.status(400).json({
          message: "Stock date cannot be in the future",
        });
      }

      // Add createdBy field and convert aiFeatures to Map format
      const productData = {
        ...req.body,
        createdBy: req.user.id, // Using id from JWT token
        stockDate: stkDate, // Use provided stock date or current date
        aiFeatures: new Map(Object.entries(req.body.aiFeatures || {})),
      };

      const product = new Product(productData);
      await product.save();

      // Populate the createdBy field in the response
      await product.populate("createdBy", "username email");
      res.status(201).json(product);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

/**
 * @swagger
 * /api/products/search/image:
 *   post:
 *     summary: Search products by image
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - imageUrl
 *             properties:
 *               imageUrl:
 *                 type: string
 *               customerId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Similar products found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 searchId:
 *                   type: string
 *                 similarProducts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 */

/**
 * @swagger
 * /api/products/{id}/reviews:
 *   post:
 *     summary: Add or update a review for a product (only for purchased products)
 *     description: |
 *       Add a new review or update an existing review for a product.
 *       Customer can only review products they have purchased and received.
 *       If a review already exists, it will be updated instead of creating a new one.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Rating from 1 to 5
 *               comment:
 *                 type: string
 *                 description: Review comment
 *     responses:
 *       200:
 *         description: Review added or updated successfully
 *       400:
 *         description: Invalid rating
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Product not purchased - can only review purchased products
 *       404:
 *         description: Product not found
 */
router.post("/:id/reviews", authenticateToken, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check if customer has purchased this product
    const hasPurchased = await hasCustomerPurchasedProduct(
      req.user.profileId,
      req.params.id
    );
    if (!hasPurchased) {
      return res.status(403).json({
        success: false,
        message:
          "You can only review products that you have purchased and received",
      });
    }

    // Check if user has already reviewed
    const existingReviewIndex = product.reviews.findIndex(
      (review) => review.userId?.toString() === req.user.profileId
    );

    if (existingReviewIndex !== -1) {
      // Đã review rồi, không cho phép POST nữa
      // Update existing review
      // product.reviews[existingReviewIndex].rating = rating;
      // product.reviews[existingReviewIndex].comment = comment;
      // product.reviews[existingReviewIndex].createdAt = new Date();

      // await product.save();

      // return res.json({
      //   success: true,
      //   data: product.reviews[existingReviewIndex],
      //   message: "Review updated successfully",
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this product.",
      });
    } else {
      // Create new review
      const newReview = {
        userId: req.user.profileId,
        rating,
        comment,
      };

      product.reviews.push(newReview);
      await product.save();

      res.json({
        success: true,
        data: newReview,
        message: "Review added successfully",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error adding/updating review",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/products/{id}/reviews:
 *   get:
 *     summary: Get product reviews
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Reviews retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reviews:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user:
 *                         type: object
 *                         properties:
 *                           username:
 *                             type: string
 *                             description: Display name of the reviewer (for privacy, userId and email are hidden)
 *                       rating:
 *                         type: number
 *                       comment:
 *                         type: string
 *                       _id:
 *                         type: string
 *                         description: Review ID
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalReviews:
 *                       type: integer
 *                       description: Total number of reviews
 *                     averageRating:
 *                       type: number
 *                       description: Average rating (1-5, rounded to 1 decimal place)
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     currentPage:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *       404:
 *         description: Product not found
 */
router.get("/:id/reviews", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const product = await Product.findById(req.params.id)
      .select("reviews")
      .populate("reviews.userId", "name email"); // Populate user info from Customer model

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = product.reviews.length;

    // Sort reviews by date (newest first) and paginate
    const sortedReviews = product.reviews.sort(
      (a, b) => b.createdAt - a.createdAt
    );
    const paginatedReviews = transformReviewsForDisplay(
      sortedReviews.slice(startIndex, endIndex)
    );

    res.json({
      success: true,
      data: {
        reviews: paginatedReviews,
        summary: {
          totalReviews: total,
          averageRating: calculateAverageRating(product.reviews),
        },
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching reviews",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/products/{id}/reviews/{reviewId}:
 *   put:
 *     summary: Update a review for a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Updated rating from 1 to 5
 *               comment:
 *                 type: string
 *                 description: Updated review comment
 *     responses:
 *       200:
 *         description: Review updated successfully
 *       400:
 *         description: Invalid rating
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized or product not purchased
 *       404:
 *         description: Product or review not found
 */
router.put("/:id/reviews/:reviewId", authenticateToken, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check if customer has purchased this product
    const hasPurchased = await hasCustomerPurchasedProduct(
      req.user.profileId,
      req.params.id
    );
    if (!hasPurchased) {
      return res.status(403).json({
        success: false,
        message:
          "You can only update reviews for products that you have purchased and received",
      });
    }

    // Find the specific review
    const reviewIndex = product.reviews.findIndex(
      (review) =>
        review._id.toString() === req.params.reviewId &&
        review.userId?.toString() === req.user.profileId
    );

    if (reviewIndex === -1) {
      return res.status(404).json({
        success: false,
        message:
          "Review not found or you are not authorized to update this review",
      });
    }

    // Update the review
    product.reviews[reviewIndex].rating = rating;
    product.reviews[reviewIndex].comment = comment;
    product.reviews[reviewIndex].createdAt = new Date();

    await product.save();

    res.json({
      success: true,
      data: product.reviews[reviewIndex],
      message: "Review updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating review",
      error: error.message,
    });
  }
});

router.post("/search/image", async (req, res) => {
  try {
    const { imageUrl, customerId } = req.body;

    const imageSearch = new ImageSearch({
      imageUrl,
      customerId,
      detectedFeatures: {},
    });
    await imageSearch.save();

    const similarProducts = await Product.find().limit(5);

    res.json({
      searchId: imageSearch._id,
      similarProducts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/products/test/create-purchase:
 *   post:
 *     summary: Create test purchase for review testing (Development only)
 *     description: Creates a mock completed order for a customer to enable review testing
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *             properties:
 *               productId:
 *                 type: string
 *                 description: Product ID to create purchase for
 *               quantity:
 *                 type: number
 *                 default: 1
 *                 description: Quantity purchased
 *     responses:
 *       201:
 *         description: Test purchase created successfully
 *       400:
 *         description: Invalid product ID
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Product not found
 */
router.post("/test/create-purchase", authenticateToken, async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    // Verify product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Create a test order
    const testOrder = new Order({
      customerId: req.user.profileId,
      recipientName: "Test Customer",
      phone: "0123456789",
      email: "test@example.com",
      shippingAddress: "Test Address, Test City",
      status: "completed",
      paymentStatus: "success",
      paymentMethod: "online",
      subtotal: product.price * quantity,
      shippingFee: 30000,
      totalAmount: product.price * quantity + 30000,
      orderDate: new Date(),
    });

    await testOrder.save();

    // Create order detail
    const orderDetail = new OrderDetail({
      orderId: testOrder._id,
      productId: productId,
      quantity: quantity,
      unitPrice: product.price,
    });

    await orderDetail.save();

    res.status(201).json({
      success: true,
      message:
        "Test purchase created successfully. You can now review this product.",
      data: {
        orderId: testOrder._id,
        productId: productId,
        quantity: quantity,
        totalAmount: testOrder.totalAmount,
      },
    });
  } catch (error) {
    console.error("Error creating test purchase:", error);
    res.status(500).json({
      success: false,
      message: "Error creating test purchase",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/products/test/my-purchases:
 *   get:
 *     summary: Get customer's purchased products (Development only)
 *     description: Returns list of products customer has purchased to debug review permissions
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Purchased products retrieved successfully
 *       401:
 *         description: Not authenticated
 */
router.get("/test/my-purchases", authenticateToken, async (req, res) => {
  try {
    // Find completed/delivered orders by this customer
    const orders = await Order.find({
      customerId: req.user.profileId,
      status: { $in: ["completed", "delivered"] },
      paymentStatus: "success",
    });

    if (orders.length === 0) {
      return res.json({
        success: true,
        message: "No completed purchases found",
        data: {
          orders: [],
          purchasedProducts: [],
        },
      });
    }

    // Get all order details for these orders
    const orderIds = orders.map((order) => order._id);
    const orderDetails = await OrderDetail.find({
      orderId: { $in: orderIds },
    }).populate("productId", "name price");

    // Get unique product IDs
    const purchasedProductIds = orderDetails.map(
      (detail) => detail.productId._id
    );

    res.json({
      success: true,
      data: {
        totalOrders: orders.length,
        orders: orders.map((order) => ({
          _id: order._id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: order.totalAmount,
          orderDate: order.orderDate,
        })),
        totalPurchasedProducts: orderDetails.length,
        purchasedProducts: orderDetails.map((detail) => ({
          productId: detail.productId._id,
          productName: detail.productId.name,
          quantity: detail.quantity,
          unitPrice: detail.unitPrice,
        })),
        uniqueProductIds: [...new Set(purchasedProductIds)],
      },
    });
  } catch (error) {
    console.error("Error fetching purchases:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching purchases",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   patch:
 *     summary: Update product fields (staff only)
 *     description: Partially update a product. Only the fields provided in the request body will be updated.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               benefits:
 *                 type: array
 *                 items:
 *                   type: string
 *               skinType:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [oily, dry, combination, sensitive, normal, all]
 *               size:
 *                 type: string
 *               category:
 *                 type: string
 *               brand:
 *                 type: array
 *                 items:
 *                   type: string
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *               imageUrl:
 *                 type: string
 *               price:
 *                 type: number
 *               stockQuantity:
 *                 type: number
 *               manufacturingDate:
 *                 type: string
 *                 format: date
 *                 description: Manufacturing date of the product (YYYY-MM-DD)
 *               expiryDate:
 *                 type: string
 *                 format: date
 *                 description: Expiry date of the product (YYYY-MM-DD)
 *               stockDate:
 *                 type: string
 *                 format: date
 *                 description: Date when product was added to stock (YYYY-MM-DD)
 *               aiFeatures:
 *                 type: object
 *           example:
 *             name: "Updated Product Name"
 *             price: 399
 *             stockQuantity: 200
 *             manufacturingDate: "2025-01-01"
 *             expiryDate: "2027-01-01"
 *             stockDate: "2025-06-13"
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Product not found
 */
router.patch(
  "/:id",
  [authenticateToken, authorize(["staff"])],
  async (req, res) => {
    try {
      const updateFields = {};
      const allowedFields = [
        "name",
        "description",
        "benefits",
        "skinType",
        "size",
        "category",
        "brand",
        "features",
        "imageUrl",
        "images",
        "price",
        "stockQuantity",
        "manufacturingDate",
        "expiryDate",
        "stockDate",
      ];

      // Only include fields that are present in the request body
      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          updateFields[field] = req.body[field];
        }
      });

      // Validate dates if they are being updated
      const today = new Date();

      if (updateFields.manufacturingDate) {
        const mfgDate = new Date(updateFields.manufacturingDate);
        if (isNaN(mfgDate.getTime())) {
          return res.status(400).json({
            message: "Invalid manufacturing date format. Use YYYY-MM-DD format",
          });
        }
        if (mfgDate > today) {
          return res.status(400).json({
            message: "Manufacturing date cannot be in the future",
          });
        }
      }

      if (updateFields.expiryDate) {
        const expDate = new Date(updateFields.expiryDate);
        const mfgDate = updateFields.manufacturingDate
          ? new Date(updateFields.manufacturingDate)
          : product.manufacturingDate;

        if (isNaN(expDate.getTime())) {
          return res.status(400).json({
            message: "Invalid expiry date format. Use YYYY-MM-DD format",
          });
        }
        if (expDate <= mfgDate) {
          return res.status(400).json({
            message: "Expiry date must be after manufacturing date",
          });
        }
      }

      if (updateFields.stockDate) {
        const stkDate = new Date(updateFields.stockDate);
        if (isNaN(stkDate.getTime())) {
          return res.status(400).json({
            message: "Invalid stock date format. Use YYYY-MM-DD format",
          });
        }
        if (stkDate > today) {
          return res.status(400).json({
            message: "Stock date cannot be in the future",
          });
        }
      }

      // Handle aiFeatures separately since it's a Map
      if (req.body.aiFeatures) {
        updateFields.aiFeatures = new Map(Object.entries(req.body.aiFeatures));
      }

      // Ensure staff can only update their own products
      const product = await Product.findOne({
        _id: req.params.id,
        ...(req.user.role === "staff" ? { createdBy: req.user.id } : {}),
      });

      if (!product) {
        return res.status(404).json({
          message:
            "Product not found or you don't have permission to update it",
        });
      }

      // Xử lý đặc biệt cho mảng images
      if (updateFields.images) {
        product.images = updateFields.images;
        delete updateFields.images;
      }

      // Cập nhật các trường còn lại
      Object.assign(product, updateFields);
      await product.save();
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

/**
 * @swagger
 * /api/products/{id}/sale:
 *   patch:
 *     summary: Set sale price for a product (staff only)
 *     description: Set a sale price for a product if it's near expiry. Only the salePrice and isOnSale fields are updated.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               salePrice:
 *                 type: number
 *                 minimum: 0
 *                 description: Sale price for the product. Must be less than the original price.
 *               isOnSale:
 *                 type: boolean
 *                 description: Whether the product is on sale. If not provided, it will be true.
 *     responses:
 *       200:
 *         description: Sale price updated successfully
 *       400:
 *         description: Invalid sale price, not less than original price, or product not near expiry.
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Product not found
 */
router.patch(
  "/:id/sale",
  [authenticateToken, authorize(["staff"])],
  async (req, res) => {
    try {
      const { salePrice, isOnSale } = req.body;
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      // Chỉ cho phép sale nếu còn dưới 30 ngày hết hạn
      const today = new Date();
      const expiry = new Date(product.expiryDate);
      const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      if (diffDays > 30) {
        return res
          .status(400)
          .json({
            message: "Chỉ được sale khi sản phẩm còn dưới 30 ngày hết hạn!",
          });
      }
      if (salePrice !== undefined) {
        if (salePrice >= product.price) {
          return res
            .status(400)
            .json({ message: "Giá sale phải nhỏ hơn giá gốc!" });
        }
        product.salePrice = salePrice;
        product.isOnSale = isOnSale === undefined ? true : isOnSale;
      } else {
        // Nếu không truyền salePrice, chỉ cập nhật trạng thái sale
        product.isOnSale = !!isOnSale;
      }
      await product.save();
      res.json({ message: "Cập nhật giá sale thành công!", product });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Delete product (staff only)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Product not found
 */
router.delete(
  "/:id",
  [authenticateToken, authorize(["staff"])],
  async (req, res) => {
    try {
      // Ensure staff can only delete their own products
      const product = await Product.findOne({
        _id: req.params.id,
        ...(req.user.role === "staff" ? { createdBy: req.user.id } : {}),
      });
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      await product.deleteOne();
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;
