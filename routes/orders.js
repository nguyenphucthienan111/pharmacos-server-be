const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const OrderDetail = require("../models/OrderDetail");
const Product = require("../models/Product");
const Cart = require("../models/Cart");
const CartItem = require("../models/CartItem");
const Supplier = require("../models/Supplier"); // Added Supplier model
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
 *         _id:
 *           type: string
 *           description: Order ID
 *         customerId:
 *           type: string
 *         recipientName:
 *           type: string
 *           description: Name of the recipient
 *         phone:
 *           type: string
 *           description: Contact phone number
 *         email:
 *           type: string
 *           description: Email address
 *         shippingAddress:
 *           type: string
 *           description: Delivery address
 *         note:
 *           type: string
 *           description: Order note
 *         staffId:
 *           type: string
 *         orderDate:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *           enum: [pending, processing, shipping, delivered, completed, cancelled]
 *         paymentStatus:
 *           type: string
 *           enum: [pending, success, failed, cancelled, refunded, expired]
 *         paymentMethod:
 *           type: string
 *           enum: [cod, online, cash, bank]
 *           description: Payment method - cod (COD), online (Online Payment), cash (Cash), bank (Bank Transfer)
 *         paymentTimeout:
 *           type: string
 *           format: date-time
 *           description: Payment timeout for online orders (5 minutes)
 *         totalAmount:
 *           type: number
 *           description: Total order amount including shipping
 *         subtotal:
 *           type: number
 *           description: Subtotal before shipping fee
 *         shippingFee:
 *           type: number
 *           description: Shipping fee
 *         cancelReason:
 *           type: string
 *           description: Reason for cancellation (if cancelled)
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
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
/**
 * @swagger
 * /api/orders/manage:
 *   get:
 *     summary: Get all orders for staff management
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, shipping, delivered, completed, cancelled]
 *         description: Filter orders by status
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [pending, success, failed, cancelled, refunded, expired]
 *         description: Filter orders by payment status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of orders to retrieve
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 */
router.get("/manage", authorize(["staff", "admin"]), async (req, res) => {
  try {
    const { status, paymentStatus, limit = 50, page = 1 } = req.query;

    // Build query
    let query = {};
    if (status) {
      query.status = status;
    }
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const total = await Order.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    // Get orders with details
    const orders = await Order.find(query)
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("customerId", "name email phone")
      .populate("staffId", "name email")
      .lean();

    // For each order, get details with product info
    const ordersWithDetails = await Promise.all(
      orders.map(async (order) => {
        const orderDetails = await OrderDetail.find({
          orderId: order._id,
        }).populate({
          path: "productId",
          select: "name price images stockQuantity createdBy",
          populate: {
            path: "createdBy",
            select: "name email",
          },
        });

        return {
          ...order,
          items: orderDetails,
          itemCount: orderDetails.reduce((sum, item) => sum + item.quantity, 0),
        };
      })
    );

    res.json({
      orders: ordersWithDetails,
      pagination: {
        total,
        page: parseInt(page),
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Error in /manage:", error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/orders/stats:
 *   get:
 *     summary: Get order statistics for dashboard
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Order statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalOrders:
 *                   type: integer
 *                 ordersByStatus:
 *                   type: object
 *                 ordersByPaymentStatus:
 *                   type: object
 *                 totalRevenue:
 *                   type: number
 *                 recentOrders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 */
router.get("/stats", authorize(["staff", "admin"]), async (req, res) => {
  try {
    // Get total orders count
    const totalOrders = await Order.countDocuments();

    // Get orders by status
    const ordersByStatus = await Order.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get orders by payment status
    const ordersByPaymentStatus = await Order.aggregate([
      {
        $group: {
          _id: "$paymentStatus",
          count: { $sum: 1 },
        },
      },
    ]);

    // Calculate total revenue (completed orders only)
    const revenueResult = await Order.aggregate([
      {
        $match: { status: "completed" },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" },
        },
      },
    ]);

    const totalRevenue =
      revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

    // Get recent orders (last 10)
    const recentOrders = await Order.find()
      .sort({ orderDate: -1 })
      .limit(10)
      .populate("customerId", "name email")
      .select("_id recipientName totalAmount status paymentStatus orderDate")
      .lean();

    // Format the data
    const statusStats = {};
    ordersByStatus.forEach((item) => {
      statusStats[item._id] = item.count;
    });

    const paymentStats = {};
    ordersByPaymentStatus.forEach((item) => {
      paymentStats[item._id] = item.count;
    });

    res.json({
      totalOrders,
      ordersByStatus: statusStats,
      ordersByPaymentStatus: paymentStats,
      totalRevenue,
      recentOrders,
    });
  } catch (error) {
    console.error("Error getting order stats:", error);
    res.status(500).json({ message: error.message });
  }
});

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
 *               - paymentMethod
 *             properties:
 *               recipientName:
 *                 type: string
 *                 description: Name of the recipient
 *               phone:
 *                 type: string
 *                 description: Contact phone number
 *               email:
 *                 type: string
 *                 description: Email address (optional)
 *               shippingAddress:
 *                 type: string
 *                 description: Delivery address
 *               paymentMethod:
 *                 type: string
 *                 enum: [cod, online, cash, bank]
 *                 default: cod
 *                 description: |
 *                   Payment method:
 *                   - cod: Cash on Delivery (Thanh toán khi nhận hàng)
 *                   - online: Online Payment (Thanh toán online)
 *                   - cash: Cash Payment (Tiền mặt)
 *                   - bank: Bank Transfer (Chuyển khoản)
 *               items:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/OrderItem'
 *               note:
 *                 type: string
 *                 description: Optional note for the order (e.g., "Please call 15 minutes before delivery")
 *           example:
 *             recipientName: "Nguyen Van A"
 *             phone: "0901234567"
 *             email: "nguyenvana@email.com"
 *             shippingAddress: "123 Nguyen Trai, Quan 1, TP.HCM"
 *             paymentMethod: "cod"
 *             items:
 *               - productId: "68569707c81f7e968ba51d54"
 *                 quantity: 2
 *                 unitPrice: 150000
 *               - productId: "68569707c81f7e968ba51d55"
 *                 quantity: 1
 *                 unitPrice: 75000
 *             note: "Please call before delivery"
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
 *     summary: Update order status (staff only - limited to their products)
 *     description: |
 *       Staff can update order status only for orders containing products they created.
 *       Automatic stock management:
 *       - Non-online orders: Stock deducted from "processing" stage (reserves inventory)
 *       - Online orders: Stock already deducted on payment success
 *       - Cancelled orders: Stock restored (only if previously deducted, only for staff's products)
 *       - Double deduction prevention: Uses stockDeducted flag
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
 *                 enum: [pending, processing, shipping, delivered, completed, cancelled]
 *                 description: |
 *                   New order status (stock automatically managed):
 *                   - processing: Stock deducted to reserve inventory
 *                   - shipping/delivered/completed: No additional stock changes
 *                   - cancelled: Stock restored if previously deducted
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
    const validStatuses = [
      "pending",
      "processing",
      "shipping",
      "delivered",
      "completed",
      "cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
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
      updateData.paymentStatus = "cancelled";

      // Return products to stock when cancelling (only if stock was deducted and only for products this staff created)
      if (order.stockDeducted) {
        const staffOrderDetails = orderDetails.filter(
          (detail) => detail.productId?.createdBy?.toString() === req.user.id
        );
        for (const detail of staffOrderDetails) {
          await Product.findByIdAndUpdate(detail.productId, {
            $inc: { stockQuantity: detail.quantity },
          });
          console.log(
            `Stock restored for product ${detail.productId}: +${detail.quantity} units (cancelled by staff)`
          );
        }
        // Mark stock as not deducted
        updateData.stockDeducted = false;
      }
    } else {
      // Remove cancelReason when changing to other statuses
      updateData.cancelReason = undefined;

      // Handle stock deduction for non-online payment methods (only for staff's products)
      // Deduct stock from "processing" stage to reserve inventory
      const shouldDeductStock =
        // For all non-online methods: deduct when processing/shipping/delivered/completed
        order.paymentMethod !== "online" &&
        ["processing", "shipping", "delivered", "completed"].includes(status) &&
        // Only deduct if stock hasn't been deducted before (prevent double deduction)
        !order.stockDeducted;

      if (shouldDeductStock) {
        // Only update stock for products this staff created
        const staffOrderDetails = orderDetails.filter(
          (detail) => detail.productId?.createdBy?.toString() === req.user.id
        );
        for (const detail of staffOrderDetails) {
          await Product.findByIdAndUpdate(detail.productId, {
            $inc: { stockQuantity: -detail.quantity },
          });
          console.log(
            `Stock reduced for product ${detail.productId}: -${detail.quantity} units (${order.paymentMethod} ${status} by staff)`
          );
        }

        // Mark stock as deducted to prevent future deductions
        updateData.stockDeducted = true;

        // Update payment status for specific statuses
        if (order.paymentMethod === "cod" && status === "delivered") {
          updateData.paymentStatus = "success";
        } else if (
          (order.paymentMethod === "cash" || order.paymentMethod === "bank") &&
          status === "completed"
        ) {
          updateData.paymentStatus = "success";
        }
      }
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
    const { reason } = req.body;
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

    // Get order details to return products to stock (only if stock was deducted)
    if (order.stockDeducted) {
      const orderDetails = await OrderDetail.find({ orderId: order._id });

      // Return products to stock
      for (const detail of orderDetails) {
        await Product.findByIdAndUpdate(detail.productId, {
          $inc: { stockQuantity: detail.quantity },
        });
        console.log(
          `Stock restored for product ${detail.productId}: +${detail.quantity} units (cancelled by customer)`
        );
      }
    }

    // Update order status to cancelled instead of deleting
    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      {
        status: "cancelled",
        cancelReason: reason || "Cancelled by customer",
        stockDeducted: false, // Reset stock deducted flag
        paymentStatus: "cancelled",
      },
      { new: true, runValidators: true }
    );

    res.json({
      message: "Order cancelled successfully",
      order: updatedOrder,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/orders/{id}/update-status:
 *   patch:
 *     summary: Update order status (staff/admin can update any order - for management)
 *     description: |
 *       Updates order status with bidirectional automatic stock management:
 *       - Forward transition (pending→processing/shipping/delivered/completed): Stock deducted once
 *       - Backward transition (processing/shipping/delivered/completed→pending): Stock restored
 *       - Lateral transitions (processing↔shipping↔delivered↔completed): No stock changes
 *       - Online orders: Stock already deducted on payment success via webhook
 *       - Payment status auto-updated: COD on "delivered", Cash/Bank on "completed"
 *       - Cancelled orders: Stock restored to inventory (only if previously deducted)
 *       - Double deduction prevention: Uses stockDeducted tracking flag
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
 *                 enum: [pending, processing, shipping, delivered, completed, cancelled]
 *                 description: |
 *                   Order status:
 *                   - pending: Order created, awaiting processing (stock not reserved)
 *                   - processing: Order being prepared (stock deducted from pending→processing)
 *                   - shipping: Order in transit (stock deducted from pending→shipping)
 *                   - delivered: Order delivered (stock deducted from pending→delivered, COD payment confirmed)
 *                   - completed: Order completed (stock deducted from pending→completed, Cash/Bank payment confirmed)
 *                   - cancelled: Order cancelled (stock restored if previously deducted)
 *               note:
 *                 type: string
 *                 description: Optional note about the status change
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
router.patch(
  "/:id/update-status",
  authorize(["staff", "admin"]),
  async (req, res) => {
    try {
      const { status, note, cancelReason } = req.body;

      // Validate status enum
      const validStatuses = [
        "pending",
        "processing",
        "shipping",
        "delivered",
        "completed",
        "cancelled",
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          message: `Invalid status. Must be one of: ${validStatuses.join(
            ", "
          )}`,
        });
      }

      // Find order
      const order = await Order.findById(req.params.id).populate(
        "customerId",
        "name email"
      );
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Handle status change validation
      const updateData = {
        status,
        staffId: req.user.profileId, // Track which staff updated the order
      };

      if (status === "cancelled") {
        // Require cancelReason when changing to cancelled
        if (!cancelReason) {
          return res.status(400).json({
            message: "Cancel reason is required when cancelling an order",
          });
        }
        updateData.cancelReason = cancelReason;

        // Return products to stock when cancelling (only if stock was previously deducted)
        if (order.stockDeducted) {
          const orderDetails = await OrderDetail.find({ orderId: order._id });
          for (const detail of orderDetails) {
            await Product.findByIdAndUpdate(detail.productId, {
              $inc: { stockQuantity: detail.quantity },
            });
            console.log(
              `Stock restored for product ${detail.productId}: +${detail.quantity} units (order cancelled)`
            );
          }
          // Mark stock as not deducted
          updateData.stockDeducted = false;
        }
        // Update payment status
        updateData.paymentStatus = "cancelled";
      } else {
        // Remove cancelReason when changing to other statuses
        updateData.cancelReason = undefined;

        // Handle bidirectional stock management for non-online payment methods
        // Define status hierarchy: pending(0) < processing(1) < shipping(2) < delivered(3) < completed(4)
        const statusHierarchy = {
          pending: 0,
          processing: 1,
          shipping: 2,
          delivered: 3,
          completed: 4,
        };

        const currentStatusLevel = statusHierarchy[order.status];
        const newStatusLevel = statusHierarchy[status];
        const stockReservingStatuses = [
          "processing",
          "shipping",
          "delivered",
          "completed",
        ];

        // Only apply to non-online payment methods (COD/Cash/Bank)
        if (order.paymentMethod !== "online") {
          // Case 1: Moving from pending to any stock-reserving status (deduct stock)
          const shouldDeductStock =
            currentStatusLevel === 0 && // From pending
            newStatusLevel > 0 && // To processing/shipping/delivered/completed
            stockReservingStatuses.includes(status) &&
            !order.stockDeducted; // Not already deducted

          // Case 2: Moving from any stock-reserving status back to pending (restore stock)
          const shouldRestoreStock =
            currentStatusLevel > 0 && // From processing/shipping/delivered/completed
            newStatusLevel === 0 && // To pending
            order.stockDeducted; // Stock was previously deducted

          if (shouldDeductStock) {
            const orderDetails = await OrderDetail.find({ orderId: order._id });
            for (const detail of orderDetails) {
              await Product.findByIdAndUpdate(detail.productId, {
                $inc: { stockQuantity: -detail.quantity },
              });
              console.log(
                `Stock reduced for product ${detail.productId}: -${detail.quantity} units (${order.paymentMethod} pending→${status})`
              );
            }
            // Mark stock as deducted
            updateData.stockDeducted = true;
          } else if (shouldRestoreStock) {
            const orderDetails = await OrderDetail.find({ orderId: order._id });
            for (const detail of orderDetails) {
              await Product.findByIdAndUpdate(detail.productId, {
                $inc: { stockQuantity: detail.quantity },
              });
              console.log(
                `Stock restored for product ${detail.productId}: +${detail.quantity} units (${order.paymentMethod} ${order.status}→pending)`
              );
            }
            // Mark stock as not deducted
            updateData.stockDeducted = false;
          }

          // Update payment status for specific transitions
          if (order.paymentMethod === "cod" && status === "delivered") {
            updateData.paymentStatus = "success";
          } else if (
            (order.paymentMethod === "cash" ||
              order.paymentMethod === "bank") &&
            status === "completed"
          ) {
            updateData.paymentStatus = "success";
          }
        }
      }

      // Add note if provided
      if (note) {
        updateData.note = note;
      }

      // Update in database with validation
      const updatedOrder = await Order.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      )
        .populate("customerId", "name email")
        .populate("staffId", "name email");

      // Get order details for complete response
      const orderDetails = await OrderDetail.find({
        orderId: updatedOrder._id,
      }).populate({
        path: "productId",
        select: "name price images",
      });

      res.json({
        message: "Order status updated successfully",
        order: {
          ...updatedOrder.toObject(),
          items: orderDetails,
        },
      });
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(400).json({ message: error.message });
    }
  }
);

/**
 * @swagger
 * /api/orders/{id}/payment-status:
 *   patch:
 *     summary: Update order payment status (staff/admin only)
 *     description: |
 *       Manually update payment status for COD/Cash/Bank orders.
 *       Useful when payment is confirmed separately from order status.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentStatus
 *             properties:
 *               paymentStatus:
 *                 type: string
 *                 enum: [pending, success, failed, cancelled]
 *                 description: |
 *                   Payment status:
 *                   - pending: Payment not yet received
 *                   - success: Payment confirmed and received
 *                   - failed: Payment failed or declined
 *                   - cancelled: Payment cancelled
 *               note:
 *                 type: string
 *                 description: Optional note about payment status change
 *           examples:
 *             confirm_cod:
 *               summary: Confirm COD payment received
 *               value:
 *                 paymentStatus: "success"
 *                 note: "Cash received on delivery"
 *             confirm_bank:
 *               summary: Confirm bank transfer received
 *               value:
 *                 paymentStatus: "success"
 *                 note: "Bank transfer confirmed in account"
 *             mark_failed:
 *               summary: Mark payment as failed
 *               value:
 *                 paymentStatus: "failed"
 *                 note: "Customer unable to pay on delivery"
 *     responses:
 *       200:
 *         description: Payment status updated successfully
 *       400:
 *         description: Invalid payment status or cannot update online orders
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Order not found
 */
router.patch(
  "/:id/payment-status",
  authorize(["staff", "admin"]),
  async (req, res) => {
    try {
      const { paymentStatus, note } = req.body;

      // Validate payment status
      const validPaymentStatuses = [
        "pending",
        "success",
        "failed",
        "cancelled",
      ];
      if (!validPaymentStatuses.includes(paymentStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid payment status. Must be one of: ${validPaymentStatuses.join(
            ", "
          )}`,
        });
      }

      // Find order
      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // Prevent updating online payment status (managed by webhook)
      if (order.paymentMethod === "online") {
        return res.status(400).json({
          success: false,
          message:
            "Cannot manually update payment status for online orders. Use payment webhook.",
        });
      }

      // Prepare update data
      const updateData = {
        paymentStatus,
        staffId: req.user.profileId, // Track who updated payment
      };

      // Add note if provided
      if (note) {
        updateData.note = note;
      }

      // Update order
      const updatedOrder = await Order.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      )
        .populate("customerId", "name email")
        .populate("staffId", "name email");

      // Log payment status change
      console.log(
        `Payment status updated for order ${req.params.id}: ${order.paymentStatus} → ${paymentStatus} by ${req.user.profileId}`
      );

      res.json({
        success: true,
        message: "Payment status updated successfully",
        data: {
          orderId: updatedOrder._id,
          paymentMethod: updatedOrder.paymentMethod,
          paymentStatus: updatedOrder.paymentStatus,
          previousPaymentStatus: order.paymentStatus,
          updatedBy: req.user.profileId,
          updatedAt: updatedOrder.updatedAt,
        },
      });
    } catch (error) {
      console.error("Error updating payment status:", error);
      res.status(500).json({
        success: false,
        message: "Error updating payment status",
        error: error.message,
      });
    }
  }
);

module.exports = router;
