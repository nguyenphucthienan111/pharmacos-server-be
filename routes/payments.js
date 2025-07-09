const express = require("express");
const router = express.Router();
const Payment = require("../models/Payment");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const CartItem = require("../models/CartItem");
const Product = require("../models/Product");
const OrderDetail = require("../models/OrderDetail");
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
      // Check if payment is older than 30 minutes (PayOS links typically expire)
      const paymentAge = Date.now() - existingPayment.createdAt.getTime();
      const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds

      if (paymentAge > thirtyMinutes) {
        console.log(
          `Payment ${existingPayment._id} is older than 30 minutes, marking as expired`
        );
        existingPayment.status = "failed";
        existingPayment.cancelledAt = new Date();
        await existingPayment.save();
      } else {
        try {
          // Check if existing payment is still valid with PayOS
          const paymentInfo = await payOS.getPaymentLinkInformation(
            existingPayment.payosOrderId
          );

          // If payment is still valid (status PENDING), return existing link
          if (paymentInfo && paymentInfo.status === "PENDING") {
            return res.status(400).json({
              success: false,
              message: "A pending payment already exists for this order",
              data: {
                paymentUrl: existingPayment.paymentUrl,
                paymentId: existingPayment._id,
              },
            });
          }

          // If payment is expired/cancelled, mark as failed and create new one
          console.log(
            `Payment ${existingPayment._id} is no longer valid, creating new payment`
          );
          existingPayment.status = "failed";
          existingPayment.cancelledAt = new Date();
          await existingPayment.save();
        } catch (error) {
          console.log(
            `Error checking existing payment: ${error.message}, creating new payment`
          );
          // If error checking PayOS (payment not found), mark as failed and create new
          existingPayment.status = "failed";
          existingPayment.cancelledAt = new Date();
          await existingPayment.save();
        }
      }
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

    // Calculate subtotal from items
    const subtotal = validItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // Add shipping fee
    const shippingFee = 1000; // Default shipping fee
    const totalAmount = subtotal + shippingFee;

    if (subtotal <= 0) {
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
      description:
        `Payment for order ${orderId} (incl. ${shippingFee}₫ shipping)`.slice(
          0,
          25
        ),
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
      subtotal: subtotal,
      shippingFee: shippingFee,
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
 * /api/payments/reset/{orderId}:
 *   post:
 *     tags: [Payments]
 *     summary: Reset payment cho order (mark pending payments as failed)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của order cần reset payment
 *     responses:
 *       200:
 *         description: Reset payment thành công
 *       401:
 *         description: Chưa đăng nhập
 *       404:
 *         description: Không tìm thấy order
 *       500:
 *         description: Lỗi server
 */
router.post("/reset/:orderId", authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;

    // Find and update all pending payments for this order
    const result = await Payment.updateMany(
      {
        orderId: orderId,
        status: "pending",
      },
      {
        status: "failed",
        cancelledAt: new Date(),
      }
    );

    console.log(
      `Reset ${result.modifiedCount} pending payments for order ${orderId}`
    );

    res.json({
      success: true,
      message: `Reset ${result.modifiedCount} pending payments`,
      data: {
        modifiedCount: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("Error resetting payments:", error);
    res.status(500).json({
      success: false,
      message: "Error resetting payments",
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
 *     description: Nhận webhook từ PayOS khi có thay đổi trạng thái thanh toán
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 description: Mã trạng thái từ PayOS
 *                 example: "00"
 *               data:
 *                 type: object
 *                 properties:
 *                   orderCode:
 *                     type: number
 *                     description: Mã đơn hàng
 *                   amount:
 *                     type: number
 *                     description: Số tiền thanh toán
 *                   description:
 *                     type: string
 *                     description: Mô tả giao dịch
 *                   transactionDateTime:
 *                     type: string
 *                     description: Thời gian giao dịch
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid webhook data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid webhook data"
 *       500:
 *         description: Server error
 */
router.post("/webhook", async (req, res) => {
  try {
    console.log("PayOS webhook received:", JSON.stringify(req.body, null, 2));

    const webhookData = req.body;

    // Handle empty body (for testing purposes)
    if (!webhookData || Object.keys(webhookData).length === 0) {
      console.log("Empty webhook body received (testing)");
      return res.json({
        success: true,
        message: "Webhook endpoint is working. Send actual PayOS data.",
      });
    }

    // Verify webhook signature if needed
    // const isValidSignature = payOS.verifyPaymentWebhookData(webhookData);

    if (webhookData.code === "00" && webhookData.data) {
      // Payment successful
      const paymentData = webhookData.data;

      if (!paymentData.orderCode) {
        console.error("Missing orderCode in webhook data");
        return res.status(400).json({
          success: false,
          message: "Missing orderCode in webhook data",
        });
      }

      // Update payment status in database
      const payment = await Payment.findOne({
        payosOrderId: paymentData.orderCode.toString(),
      });

      if (payment) {
        payment.status = "completed";
        payment.transactionId = paymentData.transactionDateTime;
        payment.paidAt = new Date();
        await payment.save();

        // Get order details and update product stock
        const orderDetails = await OrderDetail.find({
          orderId: payment.orderId,
        });
        for (const detail of orderDetails) {
          // Decrease product stock quantity
          await Product.findByIdAndUpdate(detail.productId, {
            $inc: { stockQuantity: -detail.quantity },
          });
          console.log(
            `Updated stock for product ${detail.productId}, -${detail.quantity} units`
          );
        }

        // Update order status
        const order = await Order.findByIdAndUpdate(
          payment.orderId,
          { paymentStatus: "success" },
          { new: true }
        );

        // Clear cart items after successful payment
        if (order && order.customerId) {
          const cart = await Cart.findOne({ customerId: order.customerId });
          if (cart) {
            // Delete all cart items
            await CartItem.deleteMany({ cartId: cart._id });
            // Clear cart items array
            cart.items = [];
            cart.totalAmount = 0;
            await cart.save();
            console.log(`Cart cleared for customer ${order.customerId}`);
          }
        }

        console.log(
          `Payment ${payment._id} marked as completed and cart cleared`
        );

        // Return detailed success response for actual payments
        return res.json({
          success: true,
          message: "Payment processed successfully",
          data: {
            paymentId: payment._id,
            orderId: payment.orderId,
            status: "completed",
          },
        });
      } else {
        console.log(
          `Payment not found for orderCode: ${paymentData.orderCode}`
        );

        // Return informative response for unknown orderCode
        return res.json({
          success: true,
          message: `No payment found for orderCode: ${paymentData.orderCode}. This may be a test or invalid orderCode.`,
        });
      }
    } else if (
      webhookData.code &&
      webhookData.code !== "00" &&
      webhookData.data
    ) {
      // Payment failed or cancelled
      const paymentData = webhookData.data;

      if (!paymentData.orderCode) {
        console.error("Missing orderCode in failed webhook data");
        return res.status(400).json({
          success: false,
          message: "Missing orderCode in webhook data",
        });
      }

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

        // Return detailed response for failed payments
        return res.json({
          success: true,
          message: "Failed payment processed",
          data: {
            paymentId: payment._id,
            orderId: payment.orderId,
            status: "failed",
          },
        });
      } else {
        console.log(
          `Payment not found for failed orderCode: ${paymentData.orderCode}`
        );

        // Return informative response for unknown failed orderCode
        return res.json({
          success: true,
          message: `No payment found for failed orderCode: ${paymentData.orderCode}. This may be a test or invalid orderCode.`,
        });
      }
    } else {
      console.log(
        "Webhook data received but no valid code/data structure found"
      );
      return res.status(400).json({
        success: false,
        message:
          "Invalid webhook data format. Expected PayOS webhook structure.",
      });
    }

    // Fallback response (shouldn't reach here normally)
    res.json({
      success: true,
      message: "Webhook received but no specific action taken",
    });
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
