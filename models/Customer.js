const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    district: { type: String, trim: true },
    ward: { type: String, trim: true },
    addressType: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
    phone: { type: String, trim: true },
    name: { type: String, trim: true },
  },
  { _id: true }
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
