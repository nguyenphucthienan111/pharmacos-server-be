const express = require("express");
const router = express.Router();
const Customer = require("../models/Customer");
const Account = require("../models/Account");
const bcrypt = require("bcryptjs");
const { authorize } = require("../middleware/auth");

/**
 * @swagger
 * components:
 *   schemas:
 *     CustomerProfile:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *         dateOfBirth:
 *           type: string
 *           format: date
 *     ProductRecommendation:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         brand:
 *           type: object
 *         category:
 *           type: object
 *         price:
 *           type: number
 */

/**
 * @swagger
 * /api/customers/profile:
 *   get:
 *     summary: Get customer profile
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomerProfile'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Customer not found
 */
router.get("/profile", authorize(["customer"]), async (req, res) => {
  try {
    const customer = await Customer.findById(req.user.profileId).select(
      "-accountId"
    );

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/customers/profile:
 *   patch:
 *     summary: Update customer profile (partial update)
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomerProfile'
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomerProfile'
 *       400:
 *         description: Invalid input or email already in use
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Customer not found
 */
router.patch("/profile", authorize(["customer"]), async (req, res) => {
  try {
    const updateFields = {};
    const { name, gender, dateOfBirth, phone, address } = req.body;

    if (name !== undefined) updateFields.name = name;
    if (gender !== undefined) updateFields.gender = gender;
    if (dateOfBirth !== undefined) updateFields.dateOfBirth = dateOfBirth;
    if (phone !== undefined) updateFields.phone = phone;
    if (address !== undefined) updateFields.address = address;

    const customer = await Customer.findByIdAndUpdate(
      req.user.profileId,
      updateFields,
      { new: true }
    ).select("-accountId");

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
 * /api/customers/purchase-history:
 *   get:
 *     summary: Get customer's purchase history
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Purchase history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   order:
 *                     type: object
 *                   items:
 *                     type: array
 *                     items:
 *                       type: object
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get("/purchase-history", authorize(["customer"]), async (req, res) => {
  try {
    const Order = require("../models/Order");
    const OrderDetail = require("../models/OrderDetail");

    const orders = await Order.find({
      customerId: req.user.profileId,
    }).sort({ orderDate: -1 });

    const orderDetails = await Promise.all(
      orders.map(async (order) => {
        const details = await OrderDetail.find({ orderId: order._id }).populate(
          "productId",
          "name imageUrl price"
        );

        return {
          order,
          items: details,
        };
      })
    );

    res.json(orderDetails);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/customers/change-password:
 *   put:
 *     summary: Change customer password
 *     tags: [Customers]
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
 *       401:
 *         description: Not authenticated
 */
router.put("/change-password", authorize(["customer"]), async (req, res) => {
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
