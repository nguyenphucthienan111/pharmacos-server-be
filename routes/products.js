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
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           description: Detailed product description
 *         benefits:
 *           type: array
 *           items:
 *             type: string
 *           description: List of product benefits and effects
 *         skinType:
 *           type: array
 *           items:
 *             type: string
 *             enum: [oily, dry, combination, sensitive, normal, all]
 *           description: List of suitable skin types
 *         size:
 *           type: string
 *           description: Product size/volume (e.g., "30ml", "50g")
 *         ageGroup:
 *           type: string
 *         genderTarget:
 *           type: string
 *           enum: [male, female, all]
 *         category:
 *           type: string
 *           enum: [Pharmaceuticals, Skincare, Haircare, Makeup, Fragrances, Personal Care]
 *         brand:
 *           type: string
 *           enum: [The Ordinary, CeraVe, Advil, La Roche-Posay, Head & Shoulders, TRESemmé, MAC, Maybelline, Jo Malone, Colgate]
 *         features:
 *           type: array
 *           items:
 *             type: string
 *             enum: [antioxidant, brightening, moisturizing, dry skin, pain relief, headache, sun protection, sensitive skin, dandruff, scalp care, styling, volume, foundation, full coverage, eyes, volumizing, citrus, fresh, dental, whitening]
 *         imageUrl:
 *           type: string
 *         price:
 *           type: number
 *           minimum: 0
 *           required: true
 *         stockQuantity:
 *           type: number
 *           minimum: 0
 *         aiFeatures:
 *           type: object
 */

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products with filtering
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: skinType
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: benefits
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: ageGroup
 *         schema:
 *           type: string
 *       - in: query
 *         name: genderTarget
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: brand
 *         schema:
 *           type: string
 *       - in: query
 *         name: features
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
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
router.get("/", authenticateToken, async (req, res) => {
  try {
    const {
      skinType,
      benefits,
      ageGroup,
      genderTarget,
      brand,
      category,
      features,
      minPrice,
      maxPrice,
      sortBy,
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {
      ...(req.user.role === "staff" ? { createdBy: req.user.id } : {}),
    };
    if (skinType) {
      const skinTypeArray = skinType.split(",");
      filter.skinType = { $in: skinTypeArray };
    }
    if (benefits) {
      const benefitArray = benefits.split(",");
      filter.benefits = { $in: benefitArray };
    }
    if (ageGroup) filter.ageGroup = ageGroup;
    if (genderTarget) filter.genderTarget = genderTarget;
    if (brand) filter.brand = brand;
    if (category) filter.category = category;
    if (features) {
      const featureArray = features.split(",");
      filter.features = { $in: featureArray };
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    let sort = {};
    if (sortBy) {
      const [field, order] = sortBy.split(":");
      sort[field] = order === "desc" ? -1 : 1;
    }

    const products = await Product.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Product.countDocuments(filter);

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const similarities = await ProductSimilarity.find({
      productId: product._id,
    })
      .sort({ similarityScore: -1 })
      .limit(5)
      .populate("similarProductId");

    res.json({
      product,
      similarProducts: similarities.map((s) => ({
        product: s.similarProductId,
        similarityScore: s.similarityScore,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
 *             $ref: '#/components/schemas/Product'
 *           example:
 *             name: "Vitamin C Brightening Serum"
 *             description: "A powerful antioxidant serum formulated with 20% Vitamin C to brighten skin and fight signs of aging. This lightweight formula helps protect against environmental damage while improving overall skin texture and radiance."
 *             benefits: [
 *               "Brightens skin tone and reduces hyperpigmentation",
 *               "Fights free radical damage from UV rays and pollution",
 *               "Stimulates collagen production for firmer skin",
 *               "Improves skin texture and reduces fine lines"
 *             ]
 *             skinType: ["oily", "dry", "combination", "sensitive", "normal", "all"]
 *             size: "30ml"
 *             ageGroup: "18-25"
 *             genderTarget: "all"
 *             category: "Skincare"
 *             brand: "CeraVe"
 *             features: ["moisturizing", "sensitive skin"]
 *             imageUrl: "https://example.com/image.jpg"
 *             price: 299
 *             stockQuantity: 150
 *             aiFeatures: {
 *               "recommendationScore": "8.5"
 *             }
 *     responses:
 *       201:
 *         description: Product created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
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
 *               ageGroup:
 *                 type: string
 *               genderTarget:
 *                 type: string
 *                 enum: [male, female, all]
 *               category:
 *                 type: string
 *                 enum: [Pharmaceuticals, Skincare, Haircare, Makeup, Fragrances, Personal Care]
 *               brand:
 *                 type: string
 *                 enum: [The Ordinary, CeraVe, Advil, La Roche-Posay, Head & Shoulders, TRESemmé, MAC, Maybelline, Jo Malone, Colgate]
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
        "ageGroup",
        "genderTarget",
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
