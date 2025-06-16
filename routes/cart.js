const express = require("express");
const router = express.Router();
const Cart = require("../models/Cart");
const CartItem = require("../models/CartItem");
const Product = require("../models/Product");
const { authenticateToken } = require("../middleware/auth");

/**
 * @swagger
 * /api/cart:
 *   get:
 *     summary: Get user's cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's cart with items
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    let cart = await Cart.findOne({ customerId: req.user._id }).populate({
      path: "items",
      populate: {
        path: "productId",
        select: "name price image",
      },
    });

    if (!cart) {
      cart = new Cart({ customerId: req.user._id, items: [] });
      await cart.save();
    }

    res.json(cart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/cart/items:
 *   post:
 *     summary: Add item to cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - quantity
 *             properties:
 *               productId:
 *                 type: string
 *               quantity:
 *                 type: number
 *                 minimum: 1
 *     responses:
 *       201:
 *         description: Item added to cart successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Item added to cart successfully"
 *                 item:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     cartId:
 *                       type: string
 *                     productId:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         price:
 *                           type: number
 *                     quantity:
 *                       type: number
 *                     unitPrice:
 *                       type: number
 *       400:
 *         description: Invalid input or insufficient stock
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       404:
 *         description: Product not found
 */
router.post("/items", authenticateToken, async (req, res) => {
  try {
    console.log("Request body:", req.body);
    console.log("User:", req.user);
    const { productId, quantity } = req.body;

    // Validate product exists and has enough stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    if (product.stockQuantity < quantity) {
      return res.status(400).json({ message: "Insufficient stock" });
    }

    // Get or create cart
    let cart = await Cart.findOne({ customerId: req.user._id });
    if (!cart) {
      cart = new Cart({ customerId: req.user._id, items: [] });
    }

    // Check if product already in cart
    let cartItem = await CartItem.findOne({
      cartId: cart._id,
      productId: productId,
    });

    if (cartItem) {
      // Update quantity if item exists
      cartItem.quantity += quantity;
      cartItem.unitPrice = product.price;
      await cartItem.save();
    } else {
      // Create new cart item
      cartItem = new CartItem({
        cartId: cart._id,
        productId: productId,
        quantity: quantity,
        unitPrice: product.price,
      });
      await cartItem.save();
      cart.items.push(cartItem._id);
    }

    await cart.save();

    // Return only the added/updated item with subtotal
    const addedItem = await CartItem.findById(cartItem._id).populate({
      path: "productId",
      select: "name price image",
    });

    res.status(201).json({
      message: "Item added to cart successfully",
      item: {
        ...addedItem.toObject(),
        subtotal: addedItem.quantity * addedItem.unitPrice,
      },
    });
  } catch (error) {
    console.error("Error in POST /cart/items:", error);
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/cart/items/{id}:
 *   put:
 *     summary: Update cart item quantity
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: number
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Cart item updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Cart item updated successfully"
 *                 item:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     cartId:
 *                       type: string
 *                     productId:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         price:
 *                           type: number
 *                     quantity:
 *                       type: number
 *                     unitPrice:
 *                       type: number
 *       400:
 *         description: Invalid input or insufficient stock
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       403:
 *         description: Not authorized to update this cart item
 *       404:
 *         description: Cart item not found
 */
router.put("/items/:id", authenticateToken, async (req, res) => {
  try {
    const { quantity } = req.body;

    // Get cart item and validate ownership
    const cartItem = await CartItem.findById(req.params.id);
    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    const cart = await Cart.findById(cartItem.cartId);
    if (cart.customerId.toString() !== req.user._id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Validate stock
    const product = await Product.findById(cartItem.productId);
    if (product.stockQuantity < quantity) {
      return res.status(400).json({ message: "Insufficient stock" });
    }

    // Update quantity
    cartItem.quantity = quantity;
    await cartItem.save();
    await cart.save(); // Trigger totalAmount recalculation

    // Return updated cart
    // Return only the updated item
    const updatedItem = await CartItem.findById(cartItem._id).populate({
      path: "productId",
      select: "name price image",
    });

    res.json({
      message: "Cart item updated successfully",
      item: {
        ...updatedItem.toObject(),
        subtotal: updatedItem.quantity * updatedItem.unitPrice,
      },
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/cart/items/{id}:
 *   delete:
 *     summary: Remove item from cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Item removed from cart successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Item removed from cart successfully"
 *                 removedItem:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     productId:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     unitPrice:
 *                       type: number
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       403:
 *         description: Not authorized to remove this cart item
 *       404:
 *         description: Cart item not found
 */
router.delete("/items/:id", authenticateToken, async (req, res) => {
  try {
    const cartItem = await CartItem.findById(req.params.id);
    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    const cart = await Cart.findById(cartItem.cartId);
    if (cart.customerId.toString() !== req.user._id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Remove item from cart and delete cart item
    cart.items = cart.items.filter((item) => item.toString() !== req.params.id);
    await cart.save();
    await CartItem.findByIdAndDelete(req.params.id);

    // Return updated cart
    // Store item details before deletion for response
    const removedItemDetails = {
      _id: cartItem._id,
      productId: cartItem.productId,
      quantity: cartItem.quantity,
      unitPrice: cartItem.unitPrice,
    };

    res.json({
      message: "Item removed from cart successfully",
      removedItem: removedItemDetails,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
