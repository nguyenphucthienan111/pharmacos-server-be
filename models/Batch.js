const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema(
  {
    batchCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    remainingQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: function () {
        return this.quantity;
      },
    },
    unitCost: {
      type: Number,
      required: true,
      min: 0,
    },
    totalCost: {
      type: Number,
      required: true,
      min: 0,
    },
    manufacturingDate: {
      type: Date,
      required: true,
    },
    expiryDate: {
      type: Date,
      required: true,
    },
    receivedDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      required: true,
      enum: [
        "pending",
        "received",
        "active",
        "expired",
        "recalled",
        "disposed",
      ],
      default: "pending",
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
    qualityCheck: {
      passed: {
        type: Boolean,
        default: false,
      },
      checkedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SaleStaff",
      },
      checkedAt: {
        type: Date,
      },
      notes: String,
    },
    createdBy: {
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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for days until expiry
batchSchema.virtual("daysUntilExpiry").get(function () {
  const today = new Date();
  const expiry = new Date(this.expiryDate);
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Virtual for expiry status
batchSchema.virtual("expiryStatus").get(function () {
  const daysUntilExpiry = this.daysUntilExpiry;
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 30) return "expiring_soon";
  if (daysUntilExpiry <= 90) return "expiring_warning";
  return "good";
});

// Pre-save middleware to calculate total cost
batchSchema.pre("save", function (next) {
  if (this.isModified("quantity") || this.isModified("unitCost")) {
    this.totalCost = this.quantity * this.unitCost;
  }
  next();
});

// Method to check if batch is expired
batchSchema.methods.isExpired = function () {
  return new Date() > new Date(this.expiryDate);
};

// Method to check if batch is expiring soon (within 30 days)
batchSchema.methods.isExpiringSoon = function () {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  return new Date(this.expiryDate) <= thirtyDaysFromNow;
};

// Static method to generate batch code
batchSchema.statics.generateBatchCode = function () {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `B${year}${month}${day}${random}`;
};

module.exports = mongoose.model("Batch", batchSchema);
