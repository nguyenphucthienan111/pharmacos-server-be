const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    ward: { type: String, required: true, trim: true },
    addressType: {
      type: String,
      trim: true,
      enum: ["Nhà riêng", "Văn phòng"],
      default: "Nhà riêng",
    },
    isDefault: { type: Boolean, default: false },
    phone: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
  },
  {
    _id: true,
    timestamps: true,
  }
);

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    gender: String,
    dateOfBirth: Date,
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    addresses: [addressSchema],
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Customer", customerSchema);
