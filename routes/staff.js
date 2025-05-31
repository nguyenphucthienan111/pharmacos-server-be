const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Order = require("../models/Order");
const Account = require("../models/Account");
const SaleStaff = require("../models/SaleStaff");
const bcrypt = require("bcryptjs");
const Brand = require("../models/Brand");
const Category = require("../models/Category");
const { authorize } = require("../middleware/auth");

// Ensure all routes require staff role
router.use(authorize(["staff"]));

/**
 * @swagger
 * /api/staff/products:
 *   get:
 *     summary: Get all products with inventory information
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 */
router.get("/products", async (req, res) => {
  try {
    const products = await Product.find()
      .populate("brandId", "name")
      .populate("categoryId", "name");
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/staff/products/{id}:
 *   patch:
 *     summary: Update product stock
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 */
router.patch("/products/:id/stock", async (req, res) => {
  try {
    const { stockQuantity } = req.body;
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { stockQuantity },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Update sales history if stock decreased
    const currentDate = new Date();
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();

    await Product.findByIdAndUpdate(req.params.id, {
      $push: {
        salesHistory: {
          month,
          year,
          quantity: stockQuantity,
          revenue: stockQuantity * product.price,
        },
      },
    });

    res.json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/staff/orders:
 *   get:
 *     summary: Get all orders
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 */
router.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("customerId", "name email")
      .sort({ orderDate: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/staff/orders/{id}/status:
 *   patch:
 *     summary: Update order status
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 */
router.patch("/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    res.status(400).json({ message: error.message });
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
    }).populate("brandId", "name");

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
    }).populate("brandId", "name");

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

    // Update password
    const salt = await bcrypt.genSalt(10);
    account.password = await bcrypt.hash(newPassword, salt);
    await account.save();

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/staff/brands:
 *   get:
 *     summary: Get all brands
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all brands
 */
router.get("/brands", async (req, res) => {
  try {
    const brands = await Brand.find().sort({ name: 1 });
    res.json(brands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/staff/brands:
 *   post:
 *     summary: Create new brand
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
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               discountRules:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     percentage:
 *                       type: number
 *                     minPurchase:
 *                       type: number
 *     responses:
 *       201:
 *         description: Brand created successfully
 */
router.post("/brands", async (req, res) => {
  try {
    const { name, discountRules = [] } = req.body;

    // Check if brand name exists
    const existingBrand = await Brand.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    });
    if (existingBrand) {
      return res.status(400).json({ message: "Brand name already exists" });
    }

    const brand = new Brand({ name, discountRules });
    const newBrand = await brand.save();
    res.status(201).json(newBrand);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/staff/categories:
 *   get:
 *     summary: Get all categories
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all categories
 */
router.get("/categories", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/staff/categories:
 *   post:
 *     summary: Create new category
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
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               promotionRules:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     discountRate:
 *                       type: number
 *                     minQuantity:
 *                       type: number
 *     responses:
 *       201:
 *         description: Category created successfully
 */
router.post("/categories", async (req, res) => {
  try {
    const { name, promotionRules = [] } = req.body;

    // Check if category name exists
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    });
    if (existingCategory) {
      return res.status(400).json({ message: "Category name already exists" });
    }

    const category = new Category({ name, promotionRules });
    const newCategory = await category.save();
    res.status(201).json(newCategory);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
