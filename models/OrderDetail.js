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

// Update product stock quantity after saving order detail
orderDetailSchema.post("save", async function () {
  try {
    const Product = mongoose.model("Product");
    await Product.findByIdAndUpdate(this.productId, {
      $inc: { stockQuantity: -this.quantity },
    });
  } catch (error) {
    console.error("Error updating product stock:", error);
  }
});

// Restore stock quantity if order detail is deleted
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
