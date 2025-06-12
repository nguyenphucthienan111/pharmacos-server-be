const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const OrderDetail = require("../models/OrderDetail");
const Product = require("../models/Product");

/**
 * @swagger
 * /api/guest-orders:
 *   post:
 *     summary: Create new order without login
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *               - recipientName
 *               - phone
 *               - shippingAddress
 *             properties:
 *               recipientName:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               shippingAddress:
 *                 type: string
 *               note:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/OrderItem'
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Invalid input or insufficient stock
 */
router.post("/", async (req, res) => {
  try {
    const { items, recipientName, phone, email, shippingAddress, note } =
      req.body;

    // Validate required fields
    if (!recipientName || !phone || !shippingAddress) {
      return res.status(400).json({
        message: "Recipient name, phone and shipping address are required",
      });
    }

    // Validate products and stock
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({
          message: `Product ${item.productId} not found`,
        });
      }
      if (product.stockQuantity < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for product ${product.name}`,
        });
      }
    }

    // Calculate total amount
    let totalAmount = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );

    // Create order
    const order = new Order({
      recipientName,
      phone,
      email,
      shippingAddress,
      note,
      status: "pending",
      totalAmount: totalAmount,
    });
    await order.save();

    // Create order details
    const orderDetails = [];
    for (const item of items) {
      const detail = new OrderDetail({
        orderId: order._id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      });
      await detail.save();

      // Update product stock
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stockQuantity: -item.quantity },
      });

      orderDetails.push(detail);
    }

    res.status(201).json({
      order,
      items: orderDetails,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
