const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    contactPerson: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
    taxCode: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 1,
    },
    totalOrders: {
      type: Number,
      default: 0,
      description: "Number of purchase orders (batches) from this supplier",
    },
    totalValue: {
      type: Number,
      default: 0,
      description:
        "Total value of all purchase orders (batches) from this supplier",
    },
    paymentTerms: {
      type: String,
      default: "30 days",
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SaleStaff",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Static method to generate supplier code
supplierSchema.statics.generateSupplierCode = function () {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `S${year}${month}${random}`;
};

module.exports = mongoose.model("Supplier", supplierSchema);
