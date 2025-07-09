const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: false,
    },
    recipientName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: false,
      trim: true,
    },
    shippingAddress: {
      type: String,
      required: true,
      trim: true,
    },
    note: {
      type: String,
      required: false,
      trim: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SaleStaff",
      required: false,
    },
    orderDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "processing", "completed", "cancelled"],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      required: false, // init optional; migrate existing orders first
      enum: [
        "pending",
        "success", // PayOS “Completed”/“Success”
        "failed",
        "cancelled",
        "refunded",
        "expired",
      ],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["cod", "online", "cash", "bank"],
      default: "cod",
      description:
        "Phương thức thanh toán: cod (COD), online (Online Payment), cash (Tiền mặt), bank (Chuyển khoản)",
    },
    paymentTimeout: {
      type: Date,
      description: "Thời gian hết hạn thanh toán cho đơn hàng online (5 phút)",
    },
    totalAmount: {
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
    cancelReason: {
      type: String,
      required: function () {
        return this.status === "cancelled";
      },
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Pre-save middleware to set payment timeout for online orders
orderSchema.pre("save", function (next) {
  if (
    this.isNew &&
    (this.paymentMethod === "online" || this.paymentMethod === "bank")
  ) {
    // Set timeout to 5 minutes from now
    this.paymentTimeout = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  }
  next();
});

// Method to check if order payment has expired
orderSchema.methods.isPaymentExpired = function () {
  if (!this.paymentTimeout) return false;
  return Date.now() > this.paymentTimeout.getTime();
};

// Virtual for order details
orderSchema.virtual("orderDetails", {
  ref: "OrderDetail",
  localField: "_id",
  foreignField: "orderId",
});

// Calculate total amount before saving
orderSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("orderDetails")) {
    try {
      const OrderDetail = mongoose.model("OrderDetail");
      const details = await OrderDetail.find({ orderId: this._id });
      this.subtotal = details.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      );
      // Ensure shippingFee has default value
      if (!this.shippingFee) {
        this.shippingFee = 1000;
      }
      this.totalAmount = this.subtotal + this.shippingFee;
    } catch (error) {
      next(error);
    }
  }
  next();
});

module.exports = mongoose.model("Order", orderSchema);
