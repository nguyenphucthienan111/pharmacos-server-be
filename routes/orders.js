const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const OrderDetail = require("../models/OrderDetail");
const Product = require("../models/Product");
const { authorize } = require("../middleware/auth");

/**
 * @swagger
 * components:
 *   schemas:
 *     OrderItem:
 *       type: object
 *       required:
 *         - productId
 *         - quantity
 *         - unitPrice
 *       properties:
 *         productId:
 *           type: string
 *         quantity:
 *           type: integer
 *           minimum: 1
 *         unitPrice:
 *           type: number
 *           minimum: 0
 *     Order:
 *       type: object
 *       properties:
 *         customerId:
 *           type: string
 *         staffId:
 *           type: string
 *         orderType:
 *           type: string
 *           enum: [Online, POS]
 *         status:
 *           type: string
 *           enum: [pending, processing, completed, cancelled]
 *         totalAmount:
 *           type: number
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderItem'
 */

/**
 * @swagger
 * /api/orders/my-orders:
 *   get:
 *     summary: Get customer's order history
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Order'
 *       401:
 *         description: Not authenticated
 */
router.get("/my-orders", authorize(["customer", "staff"]), async (req, res) => {
  try {
    let query = {};

    if (req.user.role === "customer") {
      // Customers can only see their own orders
      query = { customerId: req.user.profileId };
    }

    // Get all orders or customer's orders
    const orders = await Order.find(query)
      .sort({ orderDate: -1 })
      .populate("customerId", "name email");

    // For each order, get details and check products
    const ordersWithDetails = await Promise.all(
      orders.map(async (order) => {
        // Get order details with product info
        const orderDetails = await OrderDetail.find({
          orderId: order._id,
        }).populate({
          path: "productId",
          select: "name price createdBy",
        });

        // For debugging
        console.log("Order details:", JSON.stringify(orderDetails, null, 2));
        console.log("Staff ID:", req.user.profileId);

        // If staff, filter to only show their products
        if (req.user.role === "staff") {
          // Filter products created by this staff
          const staffProducts = orderDetails.filter(
            (detail) => detail.productId?.createdBy?.toString() === req.user.id
          );

          // Skip if no products from this staff
          if (staffProducts.length === 0) return null;

          // Return order with only staff's products
          return {
            ...order.toObject(),
            items: staffProducts,
          };
        }

        // For customer, return all products
        return {
          ...order.toObject(),
          items: orderDetails,
        };
      })
    );

    // Filter out null orders (orders staff can't see)
    const filteredOrders = ordersWithDetails.filter((order) => order !== null);

    res.json(filteredOrders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Get order details by orderID
 *     tags: [Orders]
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
 *         description: Order details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OrderItem'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Order not found
 */
router.get("/:id", authorize(["customer", "staff"]), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "customerId",
      "name email"
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const orderDetails = await OrderDetail.find({
      orderId: order._id,
    }).populate({
      path: "productId",
      select: "name price createdBy",
    });

    // Check permissions
    if (req.user.role === "customer") {
      // Customers can only see their own orders
      if (order.customerId?.toString() !== req.user.profileId) {
        return res.status(403).json({ message: "Unauthorized access" });
      }
    } else if (req.user.role === "staff") {
      // Filter products created by this staff
      const staffProducts = orderDetails.filter(
        (detail) => detail.productId?.createdBy?.toString() === req.user.id
      );

      if (staffProducts.length === 0) {
        return res.status(403).json({ message: "Unauthorized access" });
      }

      // Return order with only staff's products
      res.json({
        order,
        items: staffProducts,
      });
      return;
    }

    // For customer, return all products
    res.json({
      order,
      items: orderDetails,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Create new order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/OrderItem'
 *     responses:
 *       201:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OrderItem'
 *       400:
 *         description: Invalid input or insufficient stock
 *       401:
 *         description: Not authenticated
 */
router.post("/", authorize(["customer"]), async (req, res) => {
  try {
    const { items } = req.body;

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

    const order = new Order({
      customerId: req.user.profileId,
      status: "pending",
      totalAmount: totalAmount,
    });
    await order.save();

    const orderDetails = [];
    for (const item of items) {
      const detail = new OrderDetail({
        orderId: order._id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      });
      await detail.save();
      orderDetails.push(detail);
    }

    const completeOrder = await Order.findById(order._id).populate(
      "customerId",
      "name email"
    );

    res.status(201).json({
      order: completeOrder,
      items: orderDetails,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/orders/{id}/status:
 *   patch:
 *     summary: Update order status (staff only)
 *     tags: [Orders]
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
 *                 enum: [pending, processing, completed, cancelled]
 *     responses:
 *       200:
 *         description: Order status updated successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Order not found
 */
router.patch("/:id/status", authorize(["staff", "admin"]), async (req, res) => {
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
 * /api/orders/{id}/cancel:
 *   post:
 *     summary: Cancel order (customer can cancel their own pending orders)
 *     tags: [Orders]
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
 *         description: Order cancelled successfully
 *       400:
 *         description: Order cannot be cancelled
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Order not found
 */
router.post("/:id/cancel", authorize(["customer"]), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.customerId?.toString() !== req.user.profileId) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    if (order.status !== "pending") {
      return res.status(400).json({
        message: "Only pending orders can be cancelled",
      });
    }

    // Get order details before deletion
    const orderDetails = await OrderDetail.find({ orderId: order._id });

    // Return products to stock
    for (const detail of orderDetails) {
      await Product.findByIdAndUpdate(detail.productId, {
        $inc: { stockQuantity: detail.quantity },
      });
    }

    // Delete order details
    await OrderDetail.deleteMany({ orderId: order._id });

    // Delete the order
    await Order.findByIdAndDelete(order._id);

    res.json({ message: "Order cancelled and removed successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
