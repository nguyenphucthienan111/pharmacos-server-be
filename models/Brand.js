const mongoose = require("mongoose");

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    discountRules: {
      type: [
        {
          percentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
          },
          minPurchase: {
            type: Number,
            required: true,
            min: 0,
          },
          startDate: Date,
          endDate: Date,
          active: {
            type: Boolean,
            default: true,
          },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for products
brandSchema.virtual("products", {
  ref: "Product",
  localField: "_id",
  foreignField: "brandId",
});

module.exports = mongoose.model("Brand", brandSchema);
