const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const { ImageSearch, ProductSimilarity } = require("../models/AIModels");
const { authorize, authenticateToken } = require("../middleware/auth");

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
 *             type: string
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
 *           enum: [Pharmaceuticals, Skincare, Haircare, Makeup, Fragrances, Natural Products]
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
      .populate("reviews.userId", "username email") // Populate review user details
      .select("-__v"); // Exclude version field

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const similarities = await ProductSimilarity.find({
      productId: product._id,
    })
      .sort({ similarityScore: -1 })
      .limit(5)
      .populate("similarProductId", "-__v"); // Populate and exclude version field

    res.json({
      success: true,
      data: {
        product,
        similarProducts: similarities.map((s) => ({
          product: s.similarProductId,
          similarityScore: s.similarityScore,
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

      // Add createdBy field and convert aiFeatures to Map format
      const productData = {
        ...req.body,
        createdBy: req.user.id, // Using id from JWT token
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
 *     summary: Add a review to a product
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
 *         description: Review added successfully
 *       400:
 *         description: Invalid rating or user already reviewed
 *       401:
 *         description: Not authenticated
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

    // Check if user has already reviewed
    const existingReview = product.reviews.find(
      (review) => review.userId.toString() === req.user.id
    );
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this product",
      });
    }

    product.reviews.push({
      userId: req.user.id,
      rating,
      comment,
    });

    await product.save();
    await product.populate("reviews.userId", "username email");

    res.json({
      success: true,
      data: product.reviews[product.reviews.length - 1],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error adding review",
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
 *                       userId:
 *                         type: object
 *                         properties:
 *                           username:
 *                             type: string
 *                           email:
 *                             type: string
 *                       rating:
 *                         type: number
 *                       comment:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
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
      .populate("reviews.userId", "username email")
      .select("reviews");

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
    const paginatedReviews = product.reviews
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        reviews: paginatedReviews,
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
 *                 enum: [Pharmaceuticals, Skincare, Haircare, Makeup, Fragrances, Personal Care]
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
 *               aiFeatures:
 *                 type: object
 *           example:
 *             name: "Updated Product Name"
 *             price: 399
 *             stockQuantity: 200
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
        "price",
        "stockQuantity",
      ];

      // Only include fields that are present in the request body
      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          updateFields[field] = req.body[field];
        }
      });

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
      await ProductSimilarity.deleteMany({
        $or: [{ productId: product._id }, { similarProductId: product._id }],
      });
      await product.deleteOne(); // Actually delete the product document
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;
