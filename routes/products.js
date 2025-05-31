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
 *         - function
 *         - skinGroup
 *         - brandId
 *         - categoryId
 *         - price
 *       properties:
 *         name:
 *           type: string
 *         function:
 *           type: string
 *           enum: [lotion, wash, cream, serum, mask, other]
 *         skinGroup:
 *           type: string
 *           enum: [oily, dry, combination, sensitive, normal]
 *         ageGroup:
 *           type: string
 *         genderTarget:
 *           type: string
 *           enum: [male, female, unisex]
 *         brandId:
 *           type: string
 *         categoryId:
 *           type: string
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
 *         name: skinGroup
 *         schema:
 *           type: string
 *       - in: query
 *         name: function
 *         schema:
 *           type: string
 *       - in: query
 *         name: ageGroup
 *         schema:
 *           type: string
 *       - in: query
 *         name: genderTarget
 *         schema:
 *           type: string
 *       - in: query
 *         name: brandId
 *         schema:
 *           type: string
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
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
router.get("/", async (req, res) => {
  try {
    const {
      skinGroup,
      function: productFunction,
      ageGroup,
      genderTarget,
      brandId,
      categoryId,
      minPrice,
      maxPrice,
      sortBy,
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {};
    if (skinGroup) filter.skinGroup = skinGroup;
    if (productFunction) filter.function = productFunction;
    if (ageGroup) filter.ageGroup = ageGroup;
    if (genderTarget) filter.genderTarget = genderTarget;
    if (brandId) filter.brandId = brandId;
    if (categoryId) filter.categoryId = categoryId;

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
      .limit(limit)
      .populate("brandId", "name")
      .populate("categoryId", "name");

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
    const product = await Product.findById(req.params.id)
      .populate("brandId", "name")
      .populate("categoryId", "name");

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
 *             name: "Gentle Skin Lotion"
 *             function: "lotion"
 *             skinGroup: "oily"
 *             ageGroup: "18-25"
 *             genderTarget: "female"
 *             brandId: "683a0133c42af87de6a4f8ee"
 *             categoryId: "683a01fcc42af87de6a4f8f2"
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
      // Convert aiFeatures to Map format
      const productData = {
        ...req.body,
        aiFeatures: new Map(Object.entries(req.body.aiFeatures || {})),
      };

      const product = new Product(productData);
      await product.save();
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

    const similarProducts = await Product.find()
      .limit(5)
      .populate("brandId", "name")
      .populate("categoryId", "name");

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
 *   put:
 *     summary: Update product (staff only)
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
 *             $ref: '#/components/schemas/Product'
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
router.put(
  "/:id",
  [authenticateToken, authorize(["staff"])],
  async (req, res) => {
    try {
      const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
      });
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
      const product = await Product.findByIdAndDelete(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      await ProductSimilarity.deleteMany({
        $or: [{ productId: product._id }, { similarProductId: product._id }],
      });
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;
