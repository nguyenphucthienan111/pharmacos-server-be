const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      description: "Tổng tiền hàng trước phí ship",
    },
    shippingFee: {
      type: Number,
      required: true,
      min: 0,
      default: 1000,
      description: "Phí vận chuyển",
    },
    payosOrderId: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
    },
    paymentUrl: {
      type: String,
      required: true,
    },
    description: String,
    paymentMethod: {
      type: String,
      required: true,
      enum: ["cod", "online", "cash", "bank"],
      default: "online",
      description: "Phương thức thanh toán từ order",
    },
    paymentTimeout: {
      type: Date,
      description: "Thời gian hết hạn thanh toán (5 phút sau khi tạo)",
    },
    isExpired: {
      type: Boolean,
      default: false,
      description: "Đánh dấu payment đã hết hạn",
    },
    transactionId: String,
    paidAt: Date,
    cancelledAt: Date,
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to set payment timeout for online payments
paymentSchema.pre("save", function (next) {
  if (
    this.isNew &&
    (this.paymentMethod === "online" || this.paymentMethod === "bank")
  ) {
    // Set timeout to 2 minutes from now
    this.paymentTimeout = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes
  }
  next();
});

// Method to check if payment has expired
paymentSchema.methods.isPaymentExpired = function () {
  if (!this.paymentTimeout) return false;
  return Date.now() > this.paymentTimeout.getTime();
};

// Static method to mark expired payments
paymentSchema.statics.markExpiredPayments = async function () {
  const now = new Date();
  const result = await this.updateMany(
    {
      paymentTimeout: { $lt: now },
      status: "pending",
      isExpired: false,
    },
    {
      $set: {
        status: "failed",
        isExpired: true,
        cancelledAt: now,
      },
    }
  );
  return result;
};

module.exports = mongoose.model("Payment", paymentSchema);
