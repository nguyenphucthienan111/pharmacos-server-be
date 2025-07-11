const mongoose = require("mongoose");

const orderDetailSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Note: Stock quantity is updated only when payment is completed
// This prevents stock from being locked for unpaid orders

// Restore stock quantity if order detail is deleted (for admin purposes)
orderDetailSchema.post("remove", async function () {
  try {
    const Product = mongoose.model("Product");
    await Product.findByIdAndUpdate(this.productId, {
      $inc: { stockQuantity: this.quantity },
    });
  } catch (error) {
    console.error("Error restoring product stock:", error);
  }
});

module.exports = mongoose.model("OrderDetail", orderDetailSchema);
