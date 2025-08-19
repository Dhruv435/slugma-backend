// File: backend/models/Order.js

const mongoose = require('mongoose');

// Define the schema for an Order
const orderSchema = new mongoose.Schema({
  // Reference to the User who placed the order
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Refers to the 'User' model
    required: true,
  },
  // Array of products included in the order
  products: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product', // Refers to the 'Product' model
        required: true,
      },
      name: { type: String, required: true },
      // Store current price at time of order for historical accuracy
      price: { type: Number, required: true },
      quantity: { type: Number, required: true, min: 1 },
      image: { type: String }, // Storing image path for convenience in frontend display
    },
  ],
  // Shipping address details
  shippingAddress: {
    personName: { type: String, required: true, trim: true },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required for shipping'],
      trim: true,
      validate: {
        validator: function(v) {
          return /^\d{10}$/.test(v); // Ensures 10 digits
        },
        message: props => `${props.value} is not a valid 10-digit mobile number!`
      },
    },
    address: { type: String, required: true, trim: true },
    pincode: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{6}$/, 'Pincode must be 6 digits']
    },
    state: { type: String, required: true, trim: true },
  },
  // Method of payment
  paymentMethod: {
    type: String,
    required: true,
    enum: ['Cash on Delivery', 'Google Pay'], // Restricted to these two
  },
  // Total price of the order
  totalPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  // Current status of the order lifecycle
  orderStatus: {
    type: String,
    default: 'Pending', // Initial status when order is placed
    enum: [
      'Pending',         
      'Confirmed',      
      'Processing',      
      'Shipped',         
      'Delivered',       
      'Cancelled',       
      'Delivered & Confirmed'  
    ],
  },
  // Delivery timeline option selected/set for tracking
  deliveryOption: {
    type: String,
    default: 'Option 1 - 5 days to delivery',  
    enum: [
      'Option 1 - 5 days to delivery', // Initial stage
      'Option 2 - 3 days to delivery', // Moving closer
      'Option 3 - 2 days to delivery', // Nearing delivery
      'Option 4 - 1 day to delivery',  // Very close
      'Option 5 - Arriving Today'      // On the day of delivery
    ],
  },
  // Message from admin to user (e.g., tracking info, delay notice)
  adminMessage: {
    type: String,
    default: '',
    trim: true,
  },
  // Timestamp for when the order was created
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Timestamp for the last update to the order
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  // Timestamp for when the user confirmed receipt of the product
  deliveredAt: {
    type: Date,
    default: null, // Null until confirmed by user
  },
  // Timestamp for when the order was cancelled
  cancelledAt: {
    type: Date,
    default: null, // Null until cancelled
  },
});

// Middleware to update `updatedAt` field automatically before saving
orderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Order', orderSchema);
