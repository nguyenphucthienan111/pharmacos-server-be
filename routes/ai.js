const express = require("express");
const router = express.Router();
const {
  ImageSearch,
  ProductSimilarity,
  AIFeatureMapping,
} = require("../models/AIModels");
const Product = require("../models/Product");

/**
 * @swagger
 * components:
 *   schemas:
 *     ImageSearchInput:
 *       type: object
 *       required:
 *         - imageUrl
 *       properties:
 *         imageUrl:
 *           type: string
 *           description: URL of the product image to search
 *         customerId:
 *           type: string
 *           description: Optional customer ID for tracking search history
 *     DetectedFeatures:
 *       type: object
 *       properties:
 *         colors:
 *           type: array
 *           items:
 *             type: string
 *         texture:
 *           type: string
 *         packaging:
 *           type: string
 *         size:
 *           type: string
 *     AIFeature:
 *       type: object
 *       properties:
 *         featureName:
 *           type: string
 *         featureType:
 *           type: string
 *           enum: [texture, color, packaging_type, shape, pattern]
 *         description:
 *           type: string
 */

/**
 * @swagger
 * /api/ai/image-search:
 *   post:
 *     summary: Search products using image
 *     tags: [AI Features]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ImageSearchInput'
 *     responses:
 *       200:
 *         description: Search results with similar products
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 searchId:
 *                   type: string
 *                 detectedFeatures:
 *                   $ref: '#/components/schemas/DetectedFeatures'
 *                 similarProducts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *       400:
 *         description: Invalid input
 *       500:
 *         description: AI service error
 */
router.post("/image-search", async (req, res) => {
  try {
    const { imageUrl, customerId } = req.body;

    const imageSearch = new ImageSearch({
      imageUrl,
      customerId,
      detectedFeatures: {},
    });
    await imageSearch.save();

    // Mock AI detection with sample features
    const mockDetectedFeatures = {
      colors: ["white", "beige"],
      texture: "smooth",
      packaging: "bottle",
      size: "medium",
    };

    imageSearch.detectedFeatures = mockDetectedFeatures;
    await imageSearch.save();

    const similarProducts = await Product.find({
      $or: [
        { "aiFeatures.texture": mockDetectedFeatures.texture },
        { "aiFeatures.packaging": mockDetectedFeatures.packaging },
      ],
    }).limit(5);

    res.json({
      searchId: imageSearch._id,
      detectedFeatures: mockDetectedFeatures,
      similarProducts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/ai/similar/{productId}:
 *   get:
 *     summary: Get similar products based on AI analysis
 *     tags: [AI Features]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *     responses:
 *       200:
 *         description: List of similar products with similarity scores
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 similarities:
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
router.get("/similar/:productId", async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    const similarities = await ProductSimilarity.find({
      productId: req.params.productId,
    })
      .sort({ similarityScore: -1 })
      .limit(parseInt(limit))
      .populate("similarProductId");

    res.json({
      similarities: similarities.map((s) => ({
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
 * /api/ai/features:
 *   get:
 *     summary: Get all AI feature mappings
 *     tags: [AI Features]
 *     responses:
 *       200:
 *         description: List of AI features and their descriptions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AIFeature'
 */
router.get("/features", async (req, res) => {
  try {
    const features = await AIFeatureMapping.find();
    res.json(features);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/ai/update-similarities:
 *   post:
 *     summary: Update product similarities (internal AI service use)
 *     tags: [AI Features]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - similarities
 *             properties:
 *               productId:
 *                 type: string
 *               similarities:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: string
 *                     score:
 *                       type: number
 *     responses:
 *       200:
 *         description: Similarities updated successfully
 *       404:
 *         description: Product not found
 */
router.post("/update-similarities", async (req, res) => {
  try {
    const { productId, similarities } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    await ProductSimilarity.deleteMany({ productId });

    const similarityRecords = similarities.map((s) => ({
      productId,
      similarProductId: s.productId,
      similarityScore: s.score,
    }));

    await ProductSimilarity.insertMany(similarityRecords);

    res.json({ message: "Similarities updated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/ai/search-history:
 *   get:
 *     summary: Get image search history for a customer
 *     tags: [AI Features]
 *     parameters:
 *       - in: query
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer's search history
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   imageUrl:
 *                     type: string
 *                   detectedFeatures:
 *                     $ref: '#/components/schemas/DetectedFeatures'
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 */
router.get("/search-history", async (req, res) => {
  try {
    const { customerId } = req.query;
    const history = await ImageSearch.find({ customerId })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json(history);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
