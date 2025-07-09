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
          select: "name price createdBy images", // đổi image thành images
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
 *     summary: Get order details by orderID (all roles)
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
 *       404:
 *         description: Order not found
 */
router.get(
  "/:id",
  authorize(["customer", "staff", "admin"]),
  async (req, res) => {
    try {
      const order = await Order.findById(req.params.id).populate(
        "customerId",
        "name email"
      );

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Get all order details
      const orderDetails = await OrderDetail.find({
        orderId: order._id,
      }).populate({
        path: "productId",
        select: "name price createdBy images",
      });

      let filteredDetails = orderDetails;

      // For customer, check if it's their order
      if (req.user.role === "customer") {
        // Hỗ trợ cả trường hợp customerId là object hoặc string
        const orderCustomerId =
          order.customerId?._id?.toString() || order.customerId?.toString();
        if (orderCustomerId !== req.user.profileId) {
          return res.status(404).json({ message: "Order not found" });
        }
      }

      // For staff, only show their products
      else if (req.user.role === "staff") {
        filteredDetails = orderDetails.filter(
          (detail) => detail.productId?.createdBy?.toString() === req.user.id
        );
      }
      // Admin can see all details

      return res.json({
        order,
        items: filteredDetails,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

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
 *               - recipientName
 *               - phone
 *               - shippingAddress
 *             properties:
 *               recipientName:
 *                 type: string
 *                 description: Name of the recipient
 *               phone:
 *                 type: string
 *                 description: Contact phone number
 *               shippingAddress:
 *                 type: string
 *                 description: Delivery address
 *               items:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/OrderItem'
 *               note:
 *                 type: string
 *                 description: Optional note for the order (e.g., "Please call 15 minutes before delivery")
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

    // Calculate subtotal from items
    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );

    // Add shipping fee
    const shippingFee = 1000; // Default shipping fee
    const totalAmount = subtotal + shippingFee;

    const order = new Order({
      customerId: req.user.profileId,
      recipientName: req.body.recipientName,
      phone: req.body.phone,
      shippingAddress: req.body.shippingAddress,
      status: "pending",
      totalAmount: totalAmount,
      subtotal: subtotal,
      shippingFee: shippingFee,
      note: req.body.note,
      paymentMethod: req.body.paymentMethod || "cod", // default to cash on delivery
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

    // Clear customer's cart after successful order creation
    const Cart = require("../models/Cart");
    const CartItem = require("../models/CartItem");

    try {
      // Use req.user._id (account ID) to match cart creation logic
      const cart = await Cart.findOne({ customerId: req.user._id });
      if (cart) {
        console.log(`Found cart for user ${req.user._id}, clearing items...`);
        // Delete all cart items
        await CartItem.deleteMany({ cartId: cart._id });
        // Clear cart items array
        cart.items = [];
        cart.totalAmount = 0;
        await cart.save();
        console.log(
          `Cart cleared for user ${req.user._id} after order creation`
        );
      } else {
        console.log(`No cart found for user ${req.user._id}`);
      }
    } catch (cartError) {
      console.error("Failed to clear cart after order creation:", cartError);
      // Don't fail the order creation if cart clearing fails
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
 *               cancelReason:
 *                 type: string
 *                 description: Required when status is cancelled
 *     responses:
 *       200:
 *         description: Order status updated successfully
 *       400:
 *         description: Invalid status or missing cancel reason
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Order not found
 */
router.patch("/:id/status", authorize(["staff"]), async (req, res) => {
  try {
    const { status, cancelReason } = req.body;

    // Validate status enum
    if (!["pending", "processing", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({
        message:
          "Invalid status. Must be one of: pending, processing, completed, cancelled",
      });
    }

    // Find order and validate
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Get order details and check if staff created any products
    const orderDetails = await OrderDetail.find({
      orderId: order._id,
    }).populate({
      path: "productId",
      select: "createdBy",
    });

    // Check if staff created any products in this order
    const hasCreatedProduct = orderDetails.some(
      (detail) => detail.productId?.createdBy?.toString() === req.user.id
    );

    if (!hasCreatedProduct) {
      return res.status(403).json({
        message:
          "You can only update status of orders containing products you created",
      });
    }

    // Handle status change and cancelReason
    const updateData = { status };

    if (status === "cancelled") {
      // Require cancelReason when changing to cancelled
      if (!cancelReason) {
        return res.status(400).json({
          message: "Cancel reason is required when cancelling an order",
        });
      }
      updateData.cancelReason = cancelReason;
    } else {
      // Remove cancelReason when changing to other statuses
      updateData.cancelReason = undefined;
    }

    // Update in database with validation
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json(updatedOrder);
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
