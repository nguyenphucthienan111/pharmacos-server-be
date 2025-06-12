const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
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
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

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
      this.totalAmount = details.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      );
    } catch (error) {
      next(error);
    }
  }
  next();
});

module.exports = mongoose.model("Order", orderSchema);
