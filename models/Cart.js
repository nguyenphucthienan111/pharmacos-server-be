const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CartItem",
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook để tính totalAmount
cartSchema.pre("save", async function (next) {
  if (this.isModified("items")) {
    const CartItem = mongoose.model("CartItem");
    const items = await CartItem.find({ _id: { $in: this.items } });
    this.totalAmount = items.reduce(
      (total, item) => total + item.quantity * item.unitPrice,
      0
    );
  }
  next();
});

module.exports = mongoose.model("Cart", cartSchema);
