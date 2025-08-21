// File: backend/models/Product.js

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  moreDescription: { type: [String], default: [] }, // New field for detailed description as bullet points
  price: { type: Number, required: true, min: 0 },
  salePrice: { type: Number, min: 0, default: null },
  category: { type: String, required: true, trim: true },
  size: { type: [String], default: [] },
  colors: { type: [String], default: [] },
  image: { type: String },

  stock: { type: Number, required: true, min: 0, default: 0 },
  sku: { type: String, unique: true, sparse: true, trim: true },
  
  brand: { type: String, trim: true },
  material: { type: String, trim: true },

  weight: { type: Number, min: 0, default: 0 },
  dimensions: {
    length: { type: Number, min: 0, default: 0 },
    width: { type: Number, min: 0, default: 0 },
    height: { type: Number, min: 0, default: 0 },
  },

  tags: { type: [String], default: [] },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

productSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Product', productSchema);