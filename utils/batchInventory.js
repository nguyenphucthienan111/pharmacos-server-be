const Batch = require("../models/Batch");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");

/**
 * Utility functions for batch-based inventory management
 */

/**
 * Get available batches for a product, ordered by expiry date (FIFO)
 */
const getAvailableBatches = async (productId, requiredQuantity = 0) => {
  const batches = await Batch.find({
    productId,
    status: "active",
    remainingQuantity: { $gt: 0 },
    expiryDate: { $gt: new Date() }, // Not expired
  }).sort({ expiryDate: 1 }); // FIFO - oldest first

  if (requiredQuantity > 0) {
    // Check if we have enough stock
    const totalAvailable = batches.reduce(
      (sum, batch) => sum + batch.remainingQuantity,
      0
    );
    if (totalAvailable < requiredQuantity) {
      throw new Error(
        `Insufficient stock. Available: ${totalAvailable}, Required: ${requiredQuantity}`
      );
    }
  }

  return batches;
};

/**
 * Allocate stock from batches for an order
 */
const allocateStockFromBatches = async (productId, quantity, orderId) => {
  const batches = await getAvailableBatches(productId, quantity);
  let remainingToAllocate = quantity;
  const allocations = [];

  for (const batch of batches) {
    if (remainingToAllocate <= 0) break;

    const allocateFromThisBatch = Math.min(
      batch.remainingQuantity,
      remainingToAllocate
    );

    // Update batch remaining quantity
    batch.remainingQuantity -= allocateFromThisBatch;
    await batch.save();

    // Create stock movement record
    const stockMovement = new StockMovement({
      movementType: "out",
      productId,
      batchId: batch._id,
      quantity: allocateFromThisBatch,
      unitCost: batch.unitCost,
      reason: "sale",
      reference: `Order ${orderId}`,
      referenceId: orderId,
      referenceModel: "Order",
      location: batch.location,
      notes: `Sold from batch ${batch.batchCode}`,
      performedBy: null, // Will be set by order process
      status: "completed",
    });
    await stockMovement.save();

    allocations.push({
      batchId: batch._id,
      batchCode: batch.batchCode,
      quantity: allocateFromThisBatch,
      unitCost: batch.unitCost,
    });

    remainingToAllocate -= allocateFromThisBatch;
  }

  // Update product stock quantity
  await Product.findByIdAndUpdate(productId, {
    $inc: { stockQuantity: -quantity },
  });

  return allocations;
};

/**
 * Check if product has sufficient stock
 */
const checkProductStock = async (productId, quantity) => {
  const batches = await getAvailableBatches(productId);
  const totalAvailable = batches.reduce(
    (sum, batch) => sum + batch.remainingQuantity,
    0
  );

  return {
    hasStock: totalAvailable >= quantity,
    availableQuantity: totalAvailable,
    requiredQuantity: quantity,
    batches: batches,
  };
};

/**
 * Get product stock details with batch information
 */
const getProductStockDetails = async (productId) => {
  const product = await Product.findById(productId);
  if (!product) {
    throw new Error("Product not found");
  }

  const batches = await Batch.find({
    productId,
    status: "active",
  }).sort({ expiryDate: 1 });

  const activeBatches = batches.filter(
    (batch) => batch.remainingQuantity > 0 && batch.expiryDate > new Date()
  );

  const expiringBatches = batches.filter((batch) => {
    const daysUntilExpiry = Math.ceil(
      (batch.expiryDate - new Date()) / (1000 * 60 * 60 * 24)
    );
    return batch.remainingQuantity > 0 && daysUntilExpiry <= 30;
  });

  const expiredBatches = batches.filter(
    (batch) => batch.remainingQuantity > 0 && batch.expiryDate <= new Date()
  );

  return {
    product,
    totalStock: product.stockQuantity,
    activeBatches: activeBatches.length,
    expiringBatches: expiringBatches.length,
    expiredBatches: expiredBatches.length,
    batches: batches,
    stockStatus: product.stockQuantity > 0 ? "in_stock" : "out_of_stock",
  };
};

/**
 * Update product stock quantity based on batch changes
 */
const updateProductStockFromBatches = async (productId) => {
  const batches = await Batch.find({
    productId,
    status: "active",
  });

  const totalStock = batches.reduce(
    (sum, batch) => sum + batch.remainingQuantity,
    0
  );

  await Product.findByIdAndUpdate(productId, {
    stockQuantity: totalStock,
  });

  return totalStock;
};

/**
 * Get low stock products with batch information
 */
const getLowStockProducts = async (threshold = 10) => {
  const products = await Product.find({ stockQuantity: { $lt: threshold } });

  const lowStockDetails = await Promise.all(
    products.map(async (product) => {
      const stockDetails = await getProductStockDetails(product._id);
      return {
        ...product.toObject(),
        stockDetails,
      };
    })
  );

  return lowStockDetails;
};

/**
 * Get expiring products
 */
const getExpiringProducts = async (days = 30) => {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + days);

  const expiringBatches = await Batch.find({
    expiryDate: { $lte: targetDate },
    remainingQuantity: { $gt: 0 },
    status: "active",
  }).populate("productId");

  const expiringProducts = expiringBatches.reduce((acc, batch) => {
    const productId = batch.productId._id.toString();
    if (!acc[productId]) {
      acc[productId] = {
        product: batch.productId,
        batches: [],
        totalExpiringQuantity: 0,
      };
    }
    acc[productId].batches.push(batch);
    acc[productId].totalExpiringQuantity += batch.remainingQuantity;
    return acc;
  }, {});

  return Object.values(expiringProducts);
};

module.exports = {
  getAvailableBatches,
  allocateStockFromBatches,
  checkProductStock,
  getProductStockDetails,
  updateProductStockFromBatches,
  getLowStockProducts,
  getExpiringProducts,
};
