const express = require("express");
const router = express.Router();
const Payment = require("../models/Payment");
const Order = require("../models/Order");
const { authenticateToken } = require("../middleware/auth");

// Import PayOS
console.log("Loading PayOS module...");
const PayOS = require("@payos/node");

// Initialize PayOS with proper this binding
let payOS;
try {
  payOS = new PayOS(
    process.env.PAYOS_CLIENT_ID,
    process.env.PAYOS_API_KEY,
    process.env.PAYOS_CHECKSUM_KEY
  );
  console.log("PayOS instance created successfully.");
} catch (error) {
  console.error("PayOS initialization error:", error);
  process.exit(1);
}

/**
 * @swagger
 * /api/payments/create:
 *   post:
 *     tags: [Payments]
 *     summary: Tạo payment link cho đơn hàng
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: ID của đơn hàng cần thanh toán
 *     responses:
 *       200:
 *         description: Tạo payment link thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentUrl:
 *                       type: string
 *                     paymentId:
 *                       type: string
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập đơn hàng này
 *       404:
 *         description: Không tìm thấy đơn hàng
 *       500:
 *         description: Lỗi server
 */
router.post("/create", authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Find order with populated details
    const order = await Order.findById(orderId).populate("orderDetails");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Validate customer
    const customerProfileId = req.user.profileId;
    const orderCustomerId = order.customerId?._id?.toString();
    if (!orderCustomerId || orderCustomerId !== customerProfileId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this order",
      });
    }

    // Check for existing pending payments
    const existingPayment = await Payment.findOne({
      orderId: order._id,
      status: "pending",
    });

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: "A pending payment already exists for this order",
        data: {
          paymentUrl: existingPayment.paymentUrl,
          paymentId: existingPayment._id,
        },
      });
    }

    // Get valid order items and calculate total
    const validItems = order.orderDetails
      .filter(
        (detail) =>
          detail.productId && detail.quantity > 0 && detail.unitPrice > 0
      )
      .map((detail) => ({
        name: detail.productId.name || "Product",
        price: Math.round(detail.unitPrice),
        quantity: detail.quantity,
      }));

    if (validItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid items found in order",
      });
    }

    // Calculate total amount from items
    const totalAmount = validItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    if (totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Order total amount must be greater than 0",
      });
    }

    // Generate unique PayOS order ID (must be a number)
    const orderCode = parseInt(Date.now().toString().slice(-9));

    // Create PayOS payment data
    const paymentData = {
      orderCode: orderCode,
      amount: totalAmount,
      description: `Payment for order ${orderId}`.slice(0, 25),
      items: validItems,
      returnUrl:
        process.env.PAYOS_RETURN_URL ||
        `${process.env.FRONTEND_URL}/payment/success`,
      cancelUrl:
        process.env.PAYOS_CANCEL_URL ||
        `${process.env.FRONTEND_URL}/payment/cancel`,
    };

    // Debug log to check payment data
    console.log("PayOS payment data:", JSON.stringify(paymentData, null, 2));

    // Create payment link with PayOS
    const paymentLinkResponse = await payOS.createPaymentLink(paymentData);

    // Create payment record in database
    const payment = new Payment({
      orderId: order._id,
      userId: req.user.id,
      amount: totalAmount,
      payosOrderId: orderCode.toString(),
      status: "pending",
      paymentUrl: paymentLinkResponse.checkoutUrl,
      description: paymentData.description,
    });

    await payment.save();

    res.json({
      success: true,
      data: {
        paymentUrl: paymentLinkResponse.checkoutUrl,
        paymentId: payment._id,
      },
    });
  } catch (error) {
    console.error("Error creating payment:", error);
    res.status(500).json({
      success: false,
      message: "Error creating payment",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/payments/{paymentId}:
 *   get:
 *     tags: [Payments]
 *     summary: Lấy thông tin payment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của payment
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Payment'
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền xem payment này
 *       404:
 *         description: Không tìm thấy payment
 *       500:
 *         description: Lỗi server
 */
router.get("/:paymentId", authenticateToken, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId)
      .populate("orderId")
      .populate("userId", "username email");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    if (payment.userId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this payment",
      });
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error("Error retrieving payment:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving payment",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: PayOS webhook để xử lý callback
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook data
 */
router.post("/webhook", async (req, res) => {
  try {
    console.log("PayOS webhook received:", JSON.stringify(req.body, null, 2));

    const webhookData = req.body;

    // Verify webhook signature if needed
    // const isValidSignature = payOS.verifyPaymentWebhookData(webhookData);

    if (webhookData.code === "00" && webhookData.data) {
      // Payment successful
      const paymentData = webhookData.data;

      // Update payment status in database
      const payment = await Payment.findOne({
        payosOrderId: paymentData.orderCode.toString(),
      });

      if (payment) {
        payment.status = "completed";
        payment.transactionId = paymentData.transactionDateTime;
        payment.paidAt = new Date();
        await payment.save();

        // Update order payment status
        await Order.findByIdAndUpdate(payment.orderId, {
          paymentStatus: "success",
        });

        console.log(`Payment ${payment._id} marked as completed`);
      }
    } else if (webhookData.code !== "00") {
      // Payment failed or cancelled
      const paymentData = webhookData.data;

      const payment = await Payment.findOne({
        payosOrderId: paymentData.orderCode.toString(),
      });

      if (payment) {
        payment.status = "failed";
        payment.cancelledAt = new Date();
        await payment.save();

        // Update order payment status
        await Order.findByIdAndUpdate(payment.orderId, {
          paymentStatus: "failed",
        });

        console.log(`Payment ${payment._id} marked as failed`);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error processing PayOS webhook:", error);
    res.status(500).json({
      success: false,
      message: "Error processing webhook",
      error: error.message,
    });
  }
});

module.exports = router;
