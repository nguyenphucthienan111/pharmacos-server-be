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
 *     Address:
 *       type: object
 *       required:
 *         - name
 *         - phone
 *         - city
 *         - district
 *         - ward
 *         - address
 *       properties:
 *         _id:
 *           type: string
 *           description: Address ID
 *         name:
 *           type: string
 *           description: Recipient's full name
 *           example: "John Doe"
 *         phone:
 *           type: string
 *           description: Phone number
 *           example: "0778138889"
 *         city:
 *           type: string
 *           description: City/Province
 *           example: "Ho Chi Minh City"
 *         district:
 *           type: string
 *           description: District
 *           example: "District 1"
 *         ward:
 *           type: string
 *           description: Ward
 *           example: "Ben Nghe Ward"
 *         address:
 *           type: string
 *           description: Detailed address
 *           example: "879 Main Street"
 *         addressType:
 *           type: string
 *           enum: ["Home", "Office"]
 *           description: Address type
 *           example: "Home"
 *         isDefault:
 *           type: boolean
 *           description: Set as default address
 *           default: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     AddressInput:
 *       type: object
 *       required:
 *         - name
 *         - phone
 *         - city
 *         - district
 *         - ward
 *         - address
 *       properties:
 *         name:
 *           type: string
 *           description: Recipient's full name
 *           example: "John Doe"
 *         phone:
 *           type: string
 *           description: Phone number
 *           pattern: '^[0-9]{10,11}$'
 *           example: "0778138889"
 *         city:
 *           type: string
 *           description: City/Province
 *           example: "Ho Chi Minh City"
 *         district:
 *           type: string
 *           description: District
 *           example: "District 1"
 *         ward:
 *           type: string
 *           description: Ward
 *           example: "Ben Nghe Ward"
 *         address:
 *           type: string
 *           description: Detailed address
 *           example: "879 Main Street"
 *         addressType:
 *           type: string
 *           enum: ["Home", "Office"]
 *           description: Address type
 *           default: "Home"
 *         isDefault:
 *           type: boolean
 *           description: Set as default address
 *           default: false
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

/**
 * @swagger
 * /api/customers/addresses:
 *   get:
 *     summary: Get customer's address list
 *     description: Get all saved addresses of the current customer
 *     tags: [Customer Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Address list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Address'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: No addresses found
 *       500:
 *         description: Server error
 *   post:
 *     summary: Add new address for customer
 *     description: Create a new address for customer. If isDefault=true, all other addresses will be set as non-default.
 *     tags: [Customer Addresses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddressInput'
 *           example:
 *             name: "John Doe"
 *             phone: "0778138889"
 *             city: "Ho Chi Minh City"
 *             district: "District 1"
 *             ward: "Ben Nghe Ward"
 *             address: "879 Main Street"
 *             addressType: "Home"
 *             isDefault: true
 *     responses:
 *       201:
 *         description: Address created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Address'
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Please fill in all required information"
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /api/customers/addresses/{id}:
 *   patch:
 *     summary: Update address by ID
 *     description: Update existing address information. If isDefault=true, all other addresses will be set as non-default.
 *     tags: [Customer Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the address to update
 *         example: "60d5ecb54f1b2c001f647ac7"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddressInput'
 *     responses:
 *       200:
 *         description: Address updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Address'
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Address not found
 *       500:
 *         description: Server error
 *   delete:
 *     summary: Delete address by ID
 *     description: Delete a saved address of the customer
 *     tags: [Customer Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the address to delete
 *         example: "60d5ecb54f1b2c001f647ac7"
 *     responses:
 *       200:
 *         description: Address deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Address deleted successfully"
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Address not found
 *       500:
 *         description: Server error
 */

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

    // Validation - Check required fields
    const requiredFields = [
      "name",
      "phone",
      "address",
      "city",
      "district",
      "ward",
    ];
    const missingFields = requiredFields.filter(
      (field) => !req.body[field] || req.body[field].trim() === ""
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Please fill in all required information: ${missingFields.join(
          ", "
        )}`,
      });
    }

    // Phone number validation
    const phoneRegex = /^[0-9]{10,11}$/;
    if (!phoneRegex.test(phone.toString())) {
      return res.status(400).json({
        message: "Invalid phone number. Please enter 10-11 digits",
      });
    }

    // Address type validation
    const validAddressTypes = ["Home", "Office"];
    if (addressType && !validAddressTypes.includes(addressType)) {
      return res.status(400).json({
        message: "Invalid address type. Choose 'Home' or 'Office'",
      });
    }

    // Check current customer
    let customer = await Customer.findOne({ accountId: req.user.id });

    // If set as default and customer already has addresses, set all other addresses to false
    if (
      isDefault &&
      customer &&
      customer.addresses &&
      customer.addresses.length > 0
    ) {
      await Customer.updateOne(
        { accountId: req.user.id },
        { $set: { "addresses.$[].isDefault": false } }
      );
    }

    const addressObj = {
      name: name.trim(),
      phone: phone.toString().trim(),
      address: address.trim(),
      city: city.trim(),
      district: district.trim(),
      ward: ward.trim(),
      addressType: addressType || "Home",
      isDefault: !!isDefault,
    };

    if (!customer) {
      // Create new customer if not exists
      customer = new Customer({
        name: req.user.name || name.trim(),
        email: req.user.email || "",
        phone: phone.toString().trim(),
        accountId: req.user.id,
        addresses: [addressObj],
      });
      await customer.save();
      return res.status(201).json({
        success: true,
        message: "Address added successfully",
        data: customer.addresses[0],
      });
    }

    // Check maximum address limit (limit to 10 addresses)
    if (customer.addresses && customer.addresses.length >= 10) {
      return res.status(400).json({
        message: "You have reached the maximum limit of 10 addresses",
      });
    }

    // Ensure addresses array exists
    if (!customer.addresses) {
      customer.addresses = [];
    }

    // Push new address to current customer
    customer.addresses.push(addressObj);
    await customer.save();

    const newAddress = customer.addresses[customer.addresses.length - 1];
    res.status(201).json({
      success: true,
      message: "Address added successfully",
      data: newAddress,
    });
  } catch (error) {
    console.error("Error creating address:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating address",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
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
