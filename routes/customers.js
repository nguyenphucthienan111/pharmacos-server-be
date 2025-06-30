const express = require("express");
const router = express.Router();
const Customer = require("../models/Customer");
const Account = require("../models/Account");
const bcrypt = require("bcryptjs");
const { authorize } = require("../middleware/auth");

/**
 * @swagger
 * components:
 *   schemas:
 *     CustomerProfile:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *         dateOfBirth:
 *           type: string
 *           format: date
 *         phone:
 *           type: string
 *         address:
 *           type: string
 *         city:
 *           type: string
 *         district:
 *           type: string
 *         ward:
 *           type: string
 *         addressType:
 *           type: string
 *     ProductRecommendation:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         brand:
 *           type: object
 *         category:
 *           type: object
 *         price:
 *           type: number
 */

/**
 * @swagger
 * /api/customers/profile:
 *   get:
 *     summary: Get customer profile
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomerProfile'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Customer not found
 */
router.get("/profile", authorize(["customer"]), async (req, res) => {
  try {
    const customer = await Customer.findOne({ accountId: req.user.id }).select(
      "-accountId"
    );
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    let defaultAddress = null;
    if (customer.addresses && customer.addresses.length > 0) {
      defaultAddress =
        customer.addresses.find((addr) => addr.isDefault) ||
        customer.addresses[0];
    }

    res.json({
      ...customer.toObject(),
      address: defaultAddress ? defaultAddress.address : "",
      city: defaultAddress ? defaultAddress.city : "",
      district: defaultAddress ? defaultAddress.district : "",
      ward: defaultAddress ? defaultAddress.ward : "",
      addressType: defaultAddress ? defaultAddress.addressType : "",
      isDefault: defaultAddress ? defaultAddress.isDefault : false,
      phone: defaultAddress ? defaultAddress.phone : customer.phone,
      name: defaultAddress ? defaultAddress.name : customer.name,
      addresses: customer.addresses,
      defaultAddress: defaultAddress,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/customers/profile:
 *   patch:
 *     summary: Update customer profile (partial update)
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomerProfile'
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomerProfile'
 *       400:
 *         description: Invalid input or email already in use
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Customer not found
 */
// PATCH /api/customers/profile
router.patch("/profile", authorize(["customer"]), async (req, res) => {
  try {
    const updateFields = {};
    const {
      name,
      gender,
      dateOfBirth,
      address,
      city,
      district,
      ward,
      addressType,
      isDefault,
      phone,
    } = req.body;

    const fields = [
      "name",
      "gender",
      "dateOfBirth",
      "phone",
      "address",
      "city",
      "district",
      "ward",
      "addressType",
      "isDefault",
    ];
    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    });

    if ("isDefault" in req.body) {
      updateFields.isDefault = !!req.body.isDefault;
    }

    // Update both root fields and default address if present
    const customer = await Customer.findById(req.user.profileId);

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Update root fields
    if (updateFields.name !== undefined) customer.name = updateFields.name;
    if (updateFields.gender !== undefined)
      customer.gender = updateFields.gender;
    if (updateFields.dateOfBirth !== undefined)
      customer.dateOfBirth = updateFields.dateOfBirth;
    if (updateFields.phone !== undefined) customer.phone = updateFields.phone;

    // Update default address if present and address fields provided
    if (
      customer.addresses &&
      customer.addresses.length > 0 &&
      (updateFields.address !== undefined ||
        updateFields.city !== undefined ||
        updateFields.district !== undefined ||
        updateFields.ward !== undefined ||
        updateFields.addressType !== undefined ||
        updateFields.isDefault !== undefined ||
        updateFields.phone !== undefined ||
        updateFields.name !== undefined)
    ) {
      // Find default address
      const defaultAddr =
        customer.addresses.find((addr) => addr.isDefault) ||
        customer.addresses[0];
      if (updateFields.address !== undefined)
        defaultAddr.address = updateFields.address;
      if (updateFields.city !== undefined) defaultAddr.city = updateFields.city;
      if (updateFields.district !== undefined)
        defaultAddr.district = updateFields.district;
      if (updateFields.ward !== undefined) defaultAddr.ward = updateFields.ward;
      if (updateFields.addressType !== undefined)
        defaultAddr.addressType = updateFields.addressType;
      if (updateFields.isDefault !== undefined)
        defaultAddr.isDefault = updateFields.isDefault;
      if (updateFields.phone !== undefined)
        defaultAddr.phone = updateFields.phone;
      if (updateFields.name !== undefined) defaultAddr.name = updateFields.name;
    }

    await customer.save();

    // Return updated profile (same as GET /profile)
    let defaultAddress = null;
    if (customer.addresses && customer.addresses.length > 0) {
      defaultAddress =
        customer.addresses.find((addr) => addr.isDefault) ||
        customer.addresses[0];
    }

    res.json({
      ...customer.toObject(),
      address: defaultAddress ? defaultAddress.address : "",
      city: defaultAddress ? defaultAddress.city : "",
      district: defaultAddress ? defaultAddress.district : "",
      ward: defaultAddress ? defaultAddress.ward : "",
      addressType: defaultAddress ? defaultAddress.addressType : "",
      isDefault: defaultAddress ? defaultAddress.isDefault : false,
      phone: defaultAddress ? defaultAddress.phone : customer.phone,
      name: defaultAddress ? defaultAddress.name : customer.name,
      addresses: customer.addresses,
      defaultAddress: defaultAddress,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/customers/purchase-history:
 *   get:
 *     summary: Get customer's purchase history
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Purchase history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   order:
 *                     type: object
 *                   items:
 *                     type: array
 *                     items:
 *                       type: object
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get("/purchase-history", authorize(["customer"]), async (req, res) => {
  try {
    const Order = require("../models/Order");
    const OrderDetail = require("../models/OrderDetail");

    const orders = await Order.find({
      customerId: req.user.profileId,
    }).sort({ orderDate: -1 });

    const orderDetails = await Promise.all(
      orders.map(async (order) => {
        const details = await OrderDetail.find({ orderId: order._id }).populate(
          "productId",
          "name imageUrl price"
        );

        return {
          order,
          items: details,
        };
      })
    );

    res.json(orderDetails);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/customers/change-password:
 *   put:
 *     summary: Change customer password
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid current password
 *       401:
 *         description: Not authenticated
 */
router.put("/change-password", authorize(["customer"]), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const account = await Account.findById(req.user.id);
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const isValid = await account.comparePassword(currentPassword);
    if (!isValid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    account.password = newPassword;
    await account.save();

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/addresses", authorize(["customer"]), async (req, res) => {
  try {
    const customer = await Customer.findOne({ accountId: req.user.id }).select(
      "addresses"
    );
    if (!customer) {
      return res.status(404).json({ message: "No addresses found" });
    }
    res.json(customer.addresses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update address by id
router.patch("/addresses/:id", authorize(["customer"]), async (req, res) => {
  try {
    const {
      name,
      phone,
      address,
      city,
      district,
      ward,
      addressType,
      isDefault,
    } = req.body;

    if (isDefault) {
      await Customer.updateOne(
        { accountId: req.user.id },
        { $set: { "addresses.$[].isDefault": false } }
      );
    }

    const customer = await Customer.findOneAndUpdate(
      { accountId: req.user.id, "addresses._id": req.params.id },
      {
        $set: {
          "addresses.$.name": name,
          "addresses.$.phone": phone,
          "addresses.$.address": address,
          "addresses.$.city": city,
          "addresses.$.district": district,
          "addresses.$.ward": ward,
          "addresses.$.addressType": addressType,
          "addresses.$.isDefault": !!isDefault,
        },
      },
      { new: true }
    );
    if (!customer) {
      return res.status(404).json({ message: "Address not found" });
    }
    const updatedAddr = customer.addresses.find(
      (a) => a._id.toString() === req.params.id
    );
    res.json(updatedAddr);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/addresses", authorize(["customer"]), async (req, res) => {
  try {
    const {
      name,
      phone,
      address,
      city,
      district,
      ward,
      addressType,
      isDefault,
    } = req.body;

    if (isDefault) {
      await Customer.updateOne(
        { accountId: req.user.id },
        { $set: { "addresses.$[].isDefault": false } }
      );
    }

    const addressObj = {
      name,
      phone,
      address,
      city,
      district,
      ward,
      addressType,
      isDefault: !!isDefault,
    };

    let customer = await Customer.findOne({ accountId: req.user.id });
    if (!customer) {
      customer = new Customer({
        name: req.user.name || "",
        email: req.user.email || "",
        phone: phone || "",
        accountId: req.user.id,
        addresses: [addressObj],
      });
      await customer.save();
      return res.status(201).json(customer.addresses[0]);
    }

    const updated = await Customer.findOneAndUpdate(
      { accountId: req.user.id },
      { $push: { addresses: addressObj } },
      { new: true }
    );
    res.status(201).json(updated.addresses[updated.addresses.length - 1]);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/addresses/:id", authorize(["customer"]), async (req, res) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { accountId: req.user.id },
      { $pull: { addresses: { _id: req.params.id } } },
      { new: true }
    );
    if (!customer) {
      return res.status(404).json({ message: "Address not found" });
    }
    res.json({ message: "Address deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
