const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    ingredients: [
      new mongoose.Schema(
        {
          name: {
            type: String,
            required: true,
          },
          percentage: {
            type: Number,
            min: 0,
            max: 100,
          },
          purpose: String,
        },
        {
          _id: true,
          id: false, // Explicitly disable id virtual for ingredients
        }
      ),
    ],
    instructions: {
      type: String,
      required: true,
    },
    warnings: {
      type: [String],
      default: [],
    },
    reviews: [
      new mongoose.Schema(
        {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            required: true,
          },
          rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
          },
          comment: String,
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
        {
          _id: true,
          id: false, // Explicitly disable id virtual for reviews
        }
      ),
    ],
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    benefits: {
      type: [String],
      required: true,
      default: [],
    },
    skinType: {
      type: [String],
      required: true,
      enum: ["oily", "dry", "combination", "sensitive", "normal", "all"],
      default: [],
    },
    size: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    subcategory: {
      type: String,
      // required: true,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    brand: {
      type: [String],
      required: true,
      default: [],
    },
    features: {
      type: [String],
      default: [],
    },
    images: [
      new mongoose.Schema(
        {
          url: {
            type: String,
            required: true,
          },
          alt: String,
          isPrimary: {
            type: Boolean,
            default: false,
          },
        },
        {
          _id: true,
          id: false, // Explicitly disable id virtual for images
        }
      ),
    ],
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    salePrice: {
      type: Number,
      min: 0,
      default: null,
    },
    isOnSale: {
      type: Boolean,
      default: false,
    },
    stockQuantity: {
      type: Number,
      required: true,
      default: 0,
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
    stockDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    salesHistory: [
      {
        month: Number,
        year: Number,
        quantity: Number,
        revenue: Number,
      },
    ],
    aiFeatures: {
      type: Map,
      of: String,
      default: {},
    },
    image: {
      type: String,
      required: false,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true },
    id: false, // Disable `id` virtual for the main document and subdocuments
  }
);

// Virtual for similar products
productSchema.virtual("similarProducts", {
  ref: "ProductSimilarity",
  localField: "_id",
  foreignField: "productId",
});

module.exports = mongoose.model("Product", productSchema);
