const mongoose = require("mongoose");

// Image Search Model
const imageSearchSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      // Optional for guest searches
    },
    imageUrl: {
      type: String,
      required: true,
    },
    detectedFeatures: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Product Similarity Model
const productSimilaritySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    similarProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    similarityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
  },
  {
    timestamps: true,
  }
);

// AI Feature Mapping Model
const aiFeatureMappingSchema = new mongoose.Schema(
  {
    featureName: {
      type: String,
      required: true,
      unique: true,
    },
    featureType: {
      type: String,
      required: true,
      enum: ["texture", "color", "packaging_type", "shape", "pattern"],
    },
    description: String,
  },
  {
    timestamps: true,
  }
);

// Create indexes for faster querying
productSimilaritySchema.index({ productId: 1, similarityScore: -1 });
productSimilaritySchema.index({ similarProductId: 1 });
imageSearchSchema.index({ customerId: 1, createdAt: -1 });

const ImageSearch = mongoose.model("ImageSearch", imageSearchSchema);
const ProductSimilarity = mongoose.model(
  "ProductSimilarity",
  productSimilaritySchema
);
const AIFeatureMapping = mongoose.model(
  "AIFeatureMapping",
  aiFeatureMappingSchema
);

module.exports = {
  ImageSearch,
  ProductSimilarity,
  AIFeatureMapping,
};
