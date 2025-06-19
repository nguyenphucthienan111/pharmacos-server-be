const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Order = require("../models/Order");
const Account = require("../models/Account");
const SaleStaff = require("../models/SaleStaff");
const bcrypt = require("bcryptjs");
const { authorize } = require("../middleware/auth");

// Ensure all routes require staff role
router.use(authorize(["staff"]));

/**
 * @swagger
 * /api/staff/products:
 *   get:
 *     summary: Get all products with filtering
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
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
router.get("/products", async (req, res) => {
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
      createdBy: req.user.id, // Only show products created by the current staff member
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
 * /api/staff/analytics/sales:
 *   get:
 *     summary: Get sales analytics
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Sales analytics data
 */
router.get("/analytics/sales", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {
      status: "completed",
    };

    if (startDate && endDate) {
      matchStage.orderDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const salesAnalytics = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: "$orderDate" },
            month: { $month: "$orderDate" },
          },
          totalSales: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const topProducts = await Order.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "orderdetails",
          localField: "_id",
          foreignField: "orderId",
          as: "items",
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          totalQuantity: { $sum: "$items.quantity" },
          totalRevenue: {
            $sum: { $multiply: ["$items.quantity", "$items.unitPrice"] },
          },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
    ]);

    res.json({
      salesByMonth: salesAnalytics,
      topSellingProducts: topProducts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/staff/analytics/products:
 *   get:
 *     summary: Get product performance analytics
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Product performance data
 */
router.get("/analytics/products", async (req, res) => {
  try {
    const lowStockProducts = await Product.find({
      stockQuantity: { $lt: 10 },
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const productSales = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: thirtyDaysAgo },
          status: "completed",
        },
      },
      {
        $lookup: {
          from: "orderdetails",
          localField: "_id",
          foreignField: "orderId",
          as: "items",
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          totalSales: { $sum: "$items.quantity" },
        },
      },
    ]);

    const soldProductIds = productSales.map((p) => p._id);
    const noSalesProducts = await Product.find({
      _id: { $nin: soldProductIds },
    });

    res.json({
      lowStockProducts,
      noSalesProducts,
      productSales,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/staff/analytics/inventory:
 *   get:
 *     summary: Get sales analytics by month/year
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 */
router.get("/analytics", async (req, res) => {
  try {
    const { period = "month", year, month } = req.query;

    const matchStage = {};
    if (period === "month" && year && month) {
      matchStage["salesHistory.year"] = parseInt(year);
      matchStage["salesHistory.month"] = parseInt(month);
    } else if (period === "year" && year) {
      matchStage["salesHistory.year"] = parseInt(year);
    }

    const analytics = await Product.aggregate([
      { $unwind: "$salesHistory" },
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: "$salesHistory.year",
            month: "$salesHistory.month",
          },
          totalQuantitySold: { $sum: "$salesHistory.quantity" },
          totalRevenue: { $sum: "$salesHistory.revenue" },
          averagePrice: { $avg: "$price" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const inventoryStatus = await Product.aggregate([
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalStock: { $sum: "$stockQuantity" },
          lowStockProducts: {
            $sum: { $cond: [{ $lt: ["$stockQuantity", 10] }, 1, 0] },
          },
        },
      },
    ]);

    res.json({
      salesAnalytics: analytics,
      inventoryStatus: inventoryStatus[0],
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/staff/profile:
 *   get:
 *     summary: Get staff profile
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Staff profile retrieved successfully
 *       404:
 *         description: Staff profile not found
 */
router.get("/profile", async (req, res) => {
  try {
    const staffProfile = await SaleStaff.findOne({ accountId: req.user.id });
    if (!staffProfile) {
      return res.status(404).json({ message: "Staff profile not found" });
    }
    res.json(staffProfile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/staff/profile:
 *   patch:
 *     summary: Update staff profile
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       404:
 *         description: Staff profile not found
 */
router.patch("/profile", async (req, res) => {
  try {
    const { name, email } = req.body;

    // Check if email is already taken
    const existingStaff = await SaleStaff.findOne({
      email,
      accountId: { $ne: req.user.id },
    });
    if (existingStaff) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const staffProfile = await SaleStaff.findOneAndUpdate(
      { accountId: req.user.id },
      { name, email },
      { new: true }
    );

    if (!staffProfile) {
      return res.status(404).json({ message: "Staff profile not found" });
    }

    res.json(staffProfile);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/staff/change-password:
 *   put:
 *     summary: Change staff password
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid current password
 */
router.put("/change-password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const account = await Account.findById(req.user.id);
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Verify current password
    const isValid = await account.comparePassword(currentPassword);
    if (!isValid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Update password - let the pre-save hook handle hashing
    account.password = newPassword;
    await account.save();

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
