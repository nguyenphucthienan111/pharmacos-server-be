const mongoose = require("mongoose");

const stockMovementSchema = new mongoose.Schema(
  {
    movementType: {
      type: String,
      required: true,
      enum: ["in", "out", "adjustment", "transfer", "return", "disposal"],
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: false,
    },
    quantity: {
      type: Number,
      required: true,
    },
    unitCost: {
      type: Number,
      required: true,
      min: 0,
    },
    totalValue: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      required: true,
      enum: [
        "purchase",
        "sale",
        "return",
        "adjustment",
        "transfer",
        "disposal",
        "expiry",
        "damage",
        "theft",
        "quality_control",
        "other",
      ],
    },
    reference: {
      type: String,
      required: false,
      trim: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "referenceModel",
    },
    referenceModel: {
      type: String,
      required: false,
      enum: ["Order", "Batch", "Supplier"],
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SaleStaff",
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    approvedAt: {
      type: Date,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "approved", "rejected", "completed"],
      default: "pending",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Pre-save middleware to calculate total value
stockMovementSchema.pre("save", function (next) {
  if (this.isModified("quantity") || this.isModified("unitCost")) {
    this.totalValue = this.quantity * this.unitCost;
  }
  next();
});

// Virtual for movement description
stockMovementSchema.virtual("description").get(function () {
  const typeMap = {
    in: "Nhập kho",
    out: "Xuất kho",
    adjustment: "Điều chỉnh",
    transfer: "Chuyển kho",
    return: "Trả hàng",
    disposal: "Thanh lý",
  };

  const reasonMap = {
    purchase: "Mua hàng",
    sale: "Bán hàng",
    return: "Trả hàng",
    adjustment: "Điều chỉnh",
    transfer: "Chuyển kho",
    disposal: "Thanh lý",
    expiry: "Hết hạn",
    damage: "Hư hỏng",
    theft: "Mất cắp",
    quality_control: "Kiểm soát chất lượng",
    other: "Khác",
  };

  return `${typeMap[this.movementType]} - ${reasonMap[this.reason]}`;
});

module.exports = mongoose.model("StockMovement", stockMovementSchema);
