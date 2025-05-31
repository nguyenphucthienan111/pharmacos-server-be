const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    promotionRules: {
      type: [
        {
          name: {
            type: String,
            required: true,
          },
          discountRate: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
          },
          minQuantity: {
            type: Number,
            default: 1,
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
categorySchema.virtual("products", {
  ref: "Product",
  localField: "_id",
  foreignField: "categoryId",
});

module.exports = mongoose.model("Category", categorySchema);
