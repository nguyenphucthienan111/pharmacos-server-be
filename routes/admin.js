const express = require("express");
const router = express.Router();
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Account = require("../models/Account");
const SaleStaff = require("../models/SaleStaff");
const { authorize } = require("../middleware/auth");

/**
 * @swagger
 * components:
 *   schemas:
 *     CustomerList:
 *       type: object
 *       properties:
 *         customers:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CustomerProfile'
 *         totalPages:
 *           type: integer
 *         currentPage:
 *           type: integer
 *         total:
 *           type: integer
 *     SalesAnalytics:
 *       type: object
 *       properties:
 *         salesByMonth:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               _id:
 *                 type: object
 *                 properties:
 *                   year:
 *                     type: integer
 *                   month:
 *                     type: integer
 *               totalSales:
 *                 type: number
 *               orderCount:
 *                 type: integer
 *         topSellingProducts:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               product:
 *                 $ref: '#/components/schemas/Product'
 *               totalQuantity:
 *                 type: integer
 *               totalRevenue:
 *                 type: number
 */

// Ensure all routes require admin role
router.use(authorize(["admin"]));

/**
 * @swagger
 * /api/admin/customers:
 *   get:
 *     summary: Get all customers with filtering and pagination
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: Field to sort by (e.g., name:asc, email:desc)
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
 *         description: List of customers
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomerList'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 */
router.get("/customers", async (req, res) => {
  try {
    const { search, sortBy, page = 1, limit = 10 } = req.query;

    let filter = {};
    if (search) {
      filter = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      };
    }

    let sort = {};
    if (sortBy) {
      const [field, order] = sortBy.split(":");
      sort[field] = order === "desc" ? -1 : 1;
    }

    const customers = await Customer.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Customer.countDocuments(filter);

    res.json({
      customers,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/admin/customers/{id}:
 *   get:
 *     summary: Get customer details with order history
 *     tags: [Admin]
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
 *         description: Customer details and orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 customer:
 *                   $ref: '#/components/schemas/CustomerProfile'
 *                 orders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *       404:
 *         description: Customer not found
 */
router.get("/customers/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const orders = await Order.find({ customerId: customer._id })
      .sort({ orderDate: -1 })
      .populate("staffId", "name");

    res.json({
      customer,
      orders,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/admin/customers/{id}/status:
 *   patch:
 *     summary: Update customer status
 *     tags: [Admin]
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, blocked]
 *     responses:
 *       200:
 *         description: Customer status updated successfully
 *       404:
 *         description: Customer not found
 */
router.patch("/customers/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/admin/accounts:
 *   get:
 *     summary: Get all user accounts
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user accounts
 */
router.get("/accounts", async (req, res) => {
  try {
    const accounts = await Account.find({ role: { $ne: "admin" } });
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/admin/accounts/{id}/status:
 *   patch:
 *     summary: Lock or unlock user account
 *     tags: [Admin]
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, locked]
 */
router.patch("/accounts/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const account = await Account.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    res.json(account);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     StaffResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         staff:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             name:
 *               type: string
 *             email:
 *               type: string
 *             username:
 *               type: string
 *             role:
 *               type: string
 *             accountId:
 *               type: string
 *             createdAt:
 *               type: string
 *               format: date-time
 *             updatedAt:
 *               type: string
 *               format: date-time
 *
 * /api/admin/staff:
 *   post:
 *     summary: Create a new sale staff account
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *               - email
 *               - name
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               email:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Staff account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StaffResponse'
 *       400:
 *         description: Username/email already exists or invalid input
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/staff", async (req, res) => {
  try {
    const { username, password, email, name } = req.body;

    console.log("Creating staff account with username:", username);

    // Use escapeRegExp to handle special characters in username
    const escapeRegExp = (string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    // Check if username exists (case-insensitive)
    const allAccounts = await Account.find();
    console.log("All existing accounts:", JSON.stringify(allAccounts, null, 2));

    const existingAccount = await Account.findOne({
      username: { $regex: new RegExp(`^${escapeRegExp(username)}$`, "i") },
    });
    console.log("Found existing account:", existingAccount);

    if (existingAccount) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // Check if email exists (case-insensitive)
    const existingStaff = await SaleStaff.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") },
    });
    if (existingStaff) {
      return res.status(400).json({ message: "Email already exists" });
    }

    let staffAccount;
    try {
      // Create staff account
      staffAccount = await Account.create({
        username,
        password,
        role: "staff",
        isVerified: true, // Staff accounts are pre-verified
        status: "active",
      });
    } catch (error) {
      // If account creation fails, return error
      return res.status(400).json({ message: error.message });
    }

    let staffProfile;
    try {
      // Create staff profile
      staffProfile = await SaleStaff.create({
        name,
        email,
        accountId: staffAccount._id,
      });
    } catch (error) {
      // If profile creation fails, delete the account and return error
      await Account.findByIdAndDelete(staffAccount._id);
      return res.status(400).json({ message: error.message });
    }

    const staffResponse = {
      message: "Staff account created successfully",
      staff: {
        ...staffProfile.toObject(),
        username: staffAccount.username,
        role: staffAccount.role,
        accountId: staffAccount._id,
        createdAt: staffProfile.createdAt,
        updatedAt: staffProfile.updatedAt,
      },
    };

    res.status(201).json(staffResponse);
  } catch (error) {
    console.error("Error creating staff account:", error);
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/admin/analytics/staff-performance:
 *   get:
 *     summary: Get sales staff performance analytics
 *     tags: [Admin]
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
 */
router.get("/analytics/staff-performance", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = { status: "completed" };
    if (startDate && endDate) {
      matchStage.orderDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const staffPerformance = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$staffId",
          totalSales: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 },
          averageOrderValue: { $avg: "$totalAmount" },
        },
      },
      {
        $lookup: {
          from: "accounts",
          localField: "_id",
          foreignField: "_id",
          as: "staffInfo",
        },
      },
      { $unwind: "$staffInfo" },
    ]);

    res.json(staffPerformance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
