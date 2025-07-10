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
 *           enum: [pending, processing, shipping, delivered, completed, cancelled]
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
 *     summary: Update order status (staff only - limited to their products)
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

    // Get order details to return products to stock
    const orderDetails = await OrderDetail.find({ orderId: order._id });

    // Return products to stock
    for (const detail of orderDetails) {
      await Product.findByIdAndUpdate(detail.productId, {
        $inc: { stockQuantity: detail.quantity },
      });
    }

    // Update order status to cancelled instead of deleting
    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      {
        status: "cancelled",
        cancelReason: reason || "Cancelled by customer",
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

        // Return products to stock when cancelling
        const orderDetails = await OrderDetail.find({ orderId: order._id });
        for (const detail of orderDetails) {
          await Product.findByIdAndUpdate(detail.productId, {
            $inc: { stockQuantity: detail.quantity },
          });
        }
      } else {
        // Remove cancelReason when changing to other statuses
        updateData.cancelReason = undefined;
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

module.exports = router;
