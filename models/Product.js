const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    ingredients: [
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
      enum: [
        "Pharmaceuticals",
        "Skincare",
        "Haircare",
        "Makeup",
        "Fragrances",
        "Personal Care",
      ],
    },
    brand: {
      type: String,
      required: true,
      enum: [
        "The Ordinary",
        "CeraVe",
        "Advil",
        "La Roche-Posay",
        "Head & Shoulders",
        "TRESemmé",
        "MAC",
        "Maybelline",
        "Jo Malone",
        "Colgate",
      ],
    },
    features: {
      type: [String],
      enum: [
        "antioxidant",
        "brightening",
        "moisturizing",
        "dry skin",
        "pain relief",
        "headache",
        "sun protection",
        "sensitive skin",
        "dandruff",
        "scalp care",
        "styling",
        "volume",
        "foundation",
        "full coverage",
        "eyes",
        "volumizing",
        "citrus",
        "fresh",
        "dental",
        "whitening",
      ],
      default: [],
    },
    images: [
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
    ],
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    stockQuantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for similar products
productSchema.virtual("similarProducts", {
  ref: "ProductSimilarity",
  localField: "_id",
  foreignField: "productId",
});

module.exports = mongoose.model("Product", productSchema);
