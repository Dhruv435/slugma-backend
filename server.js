// File: backend/server.js

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Load environment variables from .env file
dotenv.config();

// Initialize Express application
const app = express();

// --- Middleware Setup ---
app.use(cors({
  // === CRUCIAL FIX: Added your Vercel frontend URL to allowed origins ===
  origin: ['http://localhost:5173', 'http://localhost:5174', 'https://slugma-gold.vercel.app', 'https://slugma-admin.vercel.app'], 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

app.use('/uploads', express.static('uploads'));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
  console.log('📦 Created "uploads" directory.');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// --- MongoDB Connection ---
async function connectDbAndStartServer() {
  try {
    // Ensure MONGO_URI is set in your Vercel project environment variables for the backend
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected successfully to dhruvDB');

    const Product = require('./models/Product');
    const User = require('./models/User');
    const Order = require('./models/Order');
    const Review = require('./models/Review');

    // --- Helper function for robust number parsing ---
    const parseNumberOrDefault = (value, defaultVal = 0) => {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultVal : parsed;
    };
    const parseIntOrDefault = (value, defaultVal = 0) => {
        const parsed = parseInt(value);
        return isNaN(parsed) ? defaultVal : parsed;
    };
    // Helper for 'moreDescription' which comes as a single string with newlines
    const parseMoreDescription = (text) => {
        if (!text || typeof text !== 'string') return [];
        return text.split('\n').map(line => line.trim()).filter(line => line !== '');
    };

    // --- NEW: Universal array parsing for Multer req.body fields ---
    // Multer sometimes makes FormData arrays appear as direct array properties in req.body.
    // Or if only one item is selected, it might come as a string.
    const ensureArray = (value) => {
      if (Array.isArray(value)) {
        return value.map(item => String(item).trim()).filter(item => item !== '');
      }
      if (typeof value === 'string') {
        return value.split(',').map(item => item.trim()).filter(item => item !== '');
      }
      return [];
    };

    // --- Add this new route for the root URL ---
    app.get('/', (req, res) => {
        res.status(200).send('Welcome to the Dhruv E-commerce Backend API!');
    });
    // --- End of new root route ---


    // --- API Routes for Products ---

    // POST /api/products: Add a new product
    app.post('/api/products', upload.single('image'), async (req, res) => {
      try {
        console.log('--- SERVER: POST /api/products Request Received ---');
        console.log('SERVER: Raw req.body (before custom parsing):', req.body);
        console.log('SERVER: Raw req.file:', req.file);

        const {
          name, description, moreDescription, price, salePrice, category,
          stock, sku, brand, material, weight, length, width, height
        } = req.body;

        const imagePath = req.file ? `/uploads/${req.file.filename}` : '';

        const parsedPrice = parseNumberOrDefault(price);
        const parsedSalePrice = (salePrice === '' || salePrice === 'null' || salePrice === undefined) ? null : parseNumberOrDefault(salePrice, null);
        const parsedStock = parseIntOrDefault(stock);
        const parsedWeight = parseNumberOrDefault(weight);
        const parsedLength = parseNumberOrDefault(length);
        const parsedWidth = parseNumberOrDefault(width);
        const parsedHeight = parseNumberOrDefault(height);

        // --- Crucial change here: Directly access req.body.colors/size and ensure they are arrays ---
        const colors = ensureArray(req.body.colors); // Multer should make this an array if multiple `colors[]` were sent
        const size = ensureArray(req.body.size);     // Multer should make this an array if multiple `size[]` were sent
        const productTags = ensureArray(req.body.tags);
        const parsedMoreDescription = parseMoreDescription(moreDescription);

        console.log('SERVER: Parsed Data - Name:', name, 'Description:', description);
        console.log('SERVER: Parsed Data - Price:', parsedPrice, 'SalePrice:', parsedSalePrice, 'Stock:', parsedStock);
        console.log('SERVER: Parsed Data - Colors:', colors, 'Type:', typeof colors, 'Is Array:', Array.isArray(colors));
        console.log('SERVER: Parsed Data - Size:', size, 'Type:', typeof size, 'Is Array:', Array.isArray(size));
        console.log('SERVER: Parsed Data - More Description:', parsedMoreDescription);
        console.log('SERVER: Parsed Data - Tags:', productTags);
        console.log('----------------------------------------------------');


        // Server-side validation
        if (parsedSalePrice !== null && parsedSalePrice >= parsedPrice) {
          return res.status(400).json({ message: 'Sale price must be less than the regular price.' });
        }
        if (sku) {
          const existingProduct = await Product.findOne({ sku: sku });
          if (existingProduct) {
            return res.status(400).json({ message: 'Product with this SKU already exists.' });
          }
        }
        if (isNaN(parsedPrice) || parsedPrice <= 0) {
            return res.status(400).json({ message: 'Price must be a positive number.' });
        }
        if (isNaN(parsedStock) || parsedStock < 0) {
            return res.status(400).json({ message: 'Stock must be a non-negative number.' });
        }
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Product Name is required.' });
        }
        if (!description || !description.trim()) {
            return res.status(400).json({ message: 'Description is required.' });
        }
        if (!category || !category.trim()) {
            return res.status(400).json({ message: 'Category is required.' });
        }
        // End server-side validation

        const newProduct = new Product({
          name,
          description,
          moreDescription: parsedMoreDescription,
          price: parsedPrice,
          salePrice: parsedSalePrice,
          category,
          size, // Use the directly parsed 'size' array
          colors, // Use the directly parsed 'colors' array
          image: imagePath,
          stock: parsedStock,
          sku: sku || undefined,
          brand: brand || '',
          material: material || '',
          weight: parsedWeight,
          dimensions: {
            length: parsedLength,
            width: parsedWidth,
            height: parsedHeight,
          },
          tags: productTags,
        });

        await newProduct.save();
        res.status(201).json({ message: '✅ Product added successfully!', product: newProduct });

      } catch (err) {
        console.error('❌ Server: Error adding product:', err);
        if (err.name === 'ValidationError') {
          const messages = Object.values(err.errors).map(val => val.message);
          return res.status(400).json({ message: 'Validation Error: ' + messages.join(', ') });
        }
        res.status(500).json({ message: '❌ Failed to add product. Please check server logs.', error: err.message });
      }
    });

    // GET /api/products: Fetch all products with ratings
    app.get('/api/products', async (req, res) => {
      try {
        const products = await Product.find({});
        const allReviews = await Review.find({});
        const productReviewsMap = new Map();

        allReviews.forEach(review => {
          const productId = review.productId.toString();
          if (!productReviewsMap.has(productId)) {
            productReviewsMap.set(productId, []);
          }
          productReviewsMap.get(productId).push(review);
        });

        const productsWithRatings = products.map(product => {
          const productObj = product.toObject();
          const reviewsForProduct = productReviewsMap.get(product._id.toString()) || [];
          const reviewCount = reviewsForProduct.length;
          const totalRating = reviewsForProduct.reduce((sum, review) => sum + review.rating, 0);
          const averageRating = reviewCount > 0 ? (totalRating / reviewCount) : 0;

          return {
            ...productObj,
            averageRating: parseFloat(averageRating.toFixed(1)),
            reviewCount: reviewCount,
          };
        });

        res.status(200).json(productsWithRatings);
      } catch (err) {
        console.error('❌ Error fetching products:', err);
        res.status(500).json({ message: '❌ Failed to fetch products', error: err.message });
      }
    });

    // GET /api/products/:id: Fetch a single product by ID with all reviews
    app.get('/api/products/:id', async (req, res) => {
        try {
            const { id } = req.params;
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({ message: 'Invalid product ID format.' });
            }

            const product = await Product.findById(id);
            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            const reviews = await Review.find({ productId: id }).populate('userId', 'username');
            const reviewCount = reviews.length;
            const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
            const averageRating = reviewCount > 0 ? (totalRating / reviewCount) : 0;

            const productWithReviews = {
              ...product.toObject(),
              averageRating: parseFloat(averageRating.toFixed(1)),
              reviewCount: reviewCount,
              reviews: reviews.map(review => ({
                _id: review._id,
                userId: review.userId ? review.userId._id : null,
                username: review.userId ? review.userId.username : 'Deleted User',
                rating: review.rating,
                comment: review.comment,
                createdAt: review.createdAt,
              })),
            };

            res.status(200).json(productWithReviews);
        } catch (err) {
            console.error('❌ Error fetching single product:', err);
            if (err.name === 'CastError') {
                return res.status(400).json({ message: 'Invalid product ID format' });
            }
            res.status(500).json({ message: '❌ Failed to fetch product', error: err.message });
        }
    });

    // PUT /api/products/:id: Update a product by ID
    app.put('/api/products/:id', upload.single('image'), async (req, res) => {
      try {
        console.log('--- SERVER: PUT /api/products/:id Request Received ---');
        console.log('SERVER: Raw req.body (before custom parsing):', req.body);
        console.log('SERVER: Raw req.file:', req.file);

        const { id } = req.params;
        const {
          name, description, moreDescription, price, salePrice, category,
          stock, sku, brand, material, weight, length, width, height
        } = req.body;

        const product = await Product.findById(id);
        if (!product) {
          return res.status(404).json({ message: 'Product not found' });
        }

        const parsedPrice = parseNumberOrDefault(price);
        const parsedSalePrice = (salePrice === '' || salePrice === 'null' || salePrice === undefined) ? null : parseNumberOrDefault(salePrice, null);
        const parsedStock = parseIntOrDefault(stock);
        const parsedWeight = parseNumberOrDefault(weight);
        const parsedLength = parseNumberOrDefault(length);
        const parsedWidth = parseNumberOrDefault(width);
        const parsedHeight = parseNumberOrDefault(height);

        // --- Crucial change here: Directly access req.body.colors/size and ensure they are arrays ---
        const colors = ensureArray(req.body.colors);
        const size = ensureArray(req.body.size);
        const productTags = ensureArray(req.body.tags);
        const parsedMoreDescription = parseMoreDescription(moreDescription);

        console.log('SERVER: Parsed Data (Update) - Name:', name, 'Description:', description);
        console.log('SERVER: Parsed Data (Update) - Price:', parsedPrice, 'SalePrice:', parsedSalePrice, 'Stock:', parsedStock);
        console.log('SERVER: Parsed Data (Update) - Colors:', colors, 'Type:', typeof colors, 'Is Array:', Array.isArray(colors));
        console.log('SERVER: Parsed Data (Update) - Size:', size, 'Type:', typeof size, 'Is Array:', Array.isArray(size));
        console.log('SERVER: Parsed Data (Update) - More Description:', parsedMoreDescription);
        console.log('SERVER: Parsed Data (Update) - Tags:', productTags);
        console.log('----------------------------------------------------');

        // Server-side validation
        if (parsedSalePrice !== null && parsedSalePrice >= parsedPrice) {
          return res.status(400).json({ message: 'Sale price must be less than the regular price.' });
        }
        if (sku && product.sku !== sku) {
          const existingProduct = await Product.findOne({ sku: sku });
          if (existingProduct) {
            return res.status(400).json({ message: 'Product with this SKU already exists.' });
          }
        }
        if (isNaN(parsedPrice) || parsedPrice <= 0) {
            return res.status(400).json({ message: 'Price must be a positive number.' });
        }
        if (isNaN(parsedStock) || parsedStock < 0) {
            return res.status(400).json({ message: 'Stock must be a non-negative number.' });
        }
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Product Name is required.' });
        }
        if (!description || !description.trim()) {
            return res.status(400).json({ message: 'Description is required.' });
        }
        if (!category || !category.trim()) {
            return res.status(400).json({ message: 'Category is required.' });
        }
        // End server-side validation

        if (req.file) {
          if (product.image) {
            const oldImagePath = path.join(__dirname, product.image);
            if (fs.existsSync(oldImagePath)) {
              fs.unlinkSync(oldImagePath);
              console.log(`🗑️ Old image deleted: ${oldImagePath}`);
            }
          }
          product.image = `/uploads/${req.file.filename}`;
        }

        product.name = name;
        product.description = description;
        product.moreDescription = parsedMoreDescription;
        product.price = parsedPrice;
        product.salePrice = parsedSalePrice;
        product.category = category;
        product.size = size; // Use the directly parsed 'size' array
        product.colors = colors; // Use the directly parsed 'colors' array
        product.stock = parsedStock;
        product.sku = sku || undefined;
        product.brand = brand || '';
        product.material = material || '';
        product.weight = parsedWeight;
        product.dimensions = {
          length: parsedLength,
          width: parsedWidth,
          height: parsedHeight,
        };
        product.tags = productTags;

        await product.save();
        res.status(200).json({ message: '✅ Product updated successfully!', product });

      } catch (err) {
        console.error('❌ Server: Error updating product:', err);
        if (err.name === 'ValidationError') {
          const messages = Object.values(err.errors).map(val => val.message);
          return res.status(400).json({ message: 'Validation Error: ' + messages.join(', ') });
        }
        if (err.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid product ID format' });
        }
        res.status(500).json({ message: '❌ Failed to update product. Please check server logs.', error: err.message });
      }
    });


    // DELETE /api/products/:id: Delete a product by ID
    app.delete('/api/products/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const product = await Product.findByIdAndDelete(id);

        if (!product) {
          return res.status(404).json({ message: 'Product not found' });
        }

        if (product.image) {
          const imagePathToDelete = path.join(__dirname, product.image);
          if (fs.existsSync(imagePathToDelete)) {
            fs.unlinkSync(imagePathToDelete);
            console.log(`🗑️ Image deleted: ${imagePathToDelete}`);
          }
        }

        await Review.deleteMany({ productId: id });
        console.log(`🗑️ Reviews deleted for product ${id}`);

        res.status(200).json({ message: '✅ Product deleted successfully!' });

      } catch (err) {
        console.error('❌ Error deleting product:', err);
        if (err.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid product ID format' });
        }
        res.status(500).json({ message: '❌ Failed to delete product', error: err.message });
      }
    });

    // --- API Routes for Users ---
    app.post('/api/signup', async (req, res) => {
      try {
        const { username, password, age, mobileNumber } = req.body;

        if (!username || !password || !age || !mobileNumber) {
          return res.status(400).json({ message: 'Please enter all fields' });
        }

        const userExists = await User.findOne({ $or: [{ username }, { mobileNumber }] });
        if (userExists) {
          return res.status(400).json({ message: 'User with this username or mobile number already exists' });
        }

        const newUser = new User({
          username,
          password,
          age,
          mobileNumber
        });

        await newUser.save();
        const userResponse = newUser.toObject();
        delete userResponse.password;
        res.status(201).json({ message: '✅ User registered successfully!', user: userResponse });

      } catch (err) {
        console.error('❌ Error during user signup:', err);
        if (err.name === 'ValidationError') {
          const messages = Object.values(err.errors).map(val => val.message);
          return res.status(400).json({ message: 'Validation Error', errors: messages });
        }
        res.status(500).json({ message: '❌ Failed to register user. Please try again later.', error: err.message });
      }
    });

    app.post('/api/login', async (req, res) => {
      try {
        const { username, password } = req.body;

        if (!username || !password) {
          return res.status(400).json({ message: 'Please enter username and password' });
        }

        const user = await User.findOne({ username });

        if (user && (await user.matchPassword(password))) {
          const userResponse = user.toObject();
          delete userResponse.password;
          res.status(200).json({ message: '✅ Login successful!', user: userResponse });
        } else {
          res.status(401).json({ message: 'Invalid username or password' });
        }
      } catch (err) {
        console.error('❌ Error during user login:', err);
        res.status(500).json({ message: '❌ Failed to login. Please try again later.', error: err.message });
      }
    });

    app.get('/api/users', async (req, res) => {
      try {
        const users = await User.find({}).select('-password');
        res.status(200).json(users);
      } catch (err) {
        console.error('❌ Error fetching users:', err);
        res.status(500).json({ message: '❌ Failed to fetch users', error: err.message });
      }
    });

    app.get('/api/users/:id', async (req, res) => {
        try {
            const { id } = req.params;
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({ message: 'Invalid user ID format.' });
            }
            const user = await User.findById(id).select('-password');
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.status(200).json(user);
        } catch (err) {
            console.error('❌ Error fetching single user:', err);
            if (err.name === 'CastError') {
                return res.status(400).json({ message: 'Invalid user ID format' });
            }
            res.status(500).json({ message: '❌ Failed to fetch user', error: err.message });
      }
    });

    app.delete('/api/users/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const user = await User.findByIdAndDelete(id);

        if (!user) {
          return res.status(404).json({ message: 'User not to found' });
        }
        res.status(200).json({ message: '✅ User deleted successfully!' });
      } catch (err) {
        console.error('❌ Error deleting user:', err);
        if (err.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid user ID format' });
        }
        res.status(500).json({ message: '❌ Failed to delete user', error: err.message });
      }
    });

    // --- API Routes for Orders ---
    app.post('/api/orders', async (req, res) => {
      try {
        const { userId, products, shippingAddress, paymentMethod, totalPrice } = req.body;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({ message: 'Invalid User ID provided.' });
        }
        if (!products || products.length === 0) {
          return res.status(400).json({ message: 'Order must contain products.' });
        }
        if (!shippingAddress || !shippingAddress.personName || !shippingAddress.address || !shippingAddress.mobileNumber || !shippingAddress.pincode || !shippingAddress.state) {
          return res.status(400).json({ message: 'All shipping address fields are required.' });
        }
        if (!paymentMethod) {
          return res.status(400).json({ message: 'Payment method is required.' });
        }
        if (totalPrice === undefined || totalPrice <= 0) {
          return res.status(400).json({ message: 'Total price must be greater than zero.' });
        }

        for (const item of products) {
          if (!mongoose.Types.ObjectId.isValid(item.productId) || !item.name || item.price === undefined || item.quantity === undefined || item.quantity <= 0) {
            return res.status(400).json({ message: `Invalid product data in order: ${JSON.stringify(item)}` });
          }
        }

        const newOrder = new Order({
          userId,
          products,
          shippingAddress,
          paymentMethod,
          totalPrice,
          orderStatus: 'Pending',
          deliveryOption: 'Option 1 - 5 days to delivery',
        });

        await newOrder.save();
        res.status(201).json({ message: '✅ Order placed successfully!', order: newOrder });

      } catch (err) {
        console.error('❌ Error placing order:', err);
        if (err.name === 'ValidationError') {
          const messages = Object.values(err.errors).map(val => val.message);
          return res.status(400).json({ message: 'Validation Error', errors: messages });
        }
        res.status(500).json({ message: '❌ Failed to place order. Please try again later.', error: err.message });
      }
    });

    app.get('/api/orders', async (req, res) => {
      try {
        const { status } = req.query;
        let query = {};

        if (status === 'history') {
          query.orderStatus = { $in: ['Delivered & Confirmed', 'Cancelled'] };
        } else {
          query.orderStatus = { $nin: ['Delivered & Confirmed', 'Cancelled'] };
        }

        const orders = await Order.find(query).populate('userId', 'username mobileNumber').sort({ createdAt: -1 });
        res.status(200).json(orders);
      } catch (err) {
        console.error('❌ Error fetching all orders:', err);
        res.status(500).json({ message: '❌ Failed to fetch orders', error: err.message });
      }
    });

    app.get('/api/orders/user/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        const { status } = req.query;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid User ID format.' });
        }

        let query = { userId: userId };
        if (status === 'history') {
            query.orderStatus = { $in: ['Delivered & Confirmed', 'Cancelled'] };
        } else {
            query.orderStatus = { $nin: ['Delivered & Confirmed', 'Cancelled'] };
        }

        const orders = await Order.find(query).sort({ createdAt: -1 });
        res.status(200).json(orders);
      } catch (err) {
        console.error('❌ Error fetching user orders:', err);
        if (err.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid User ID format' });
        }
        res.status(500).json({ message: '❌ Failed to fetch user orders', error: err.message });
      }
    });

    app.get('/api/orders/:id', async (req, res) => {
      try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid Order ID format.' });
        }
        const order = await Order.findById(id).populate('userId', 'username').populate('products.productId');
        if (!order) {
          return res.status(404).json({ message: 'Order not found.' });
        }

        res.status(200).json(order);
      } catch (err) {
        console.error('❌ Error fetching single order:', err);
        if (err.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid Order ID format' });
        }
        res.status(500).json({ message: '❌ Failed to fetch order', error: err.message });
      }
    });

    app.put('/api/orders/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { orderStatus, deliveryOption, adminMessage } = req.body;

            const order = await Order.findById(id);
            if (!order) {
                return res.status(404).json({ message: 'Order not found.' });
            }

            if (order.orderStatus === 'Delivered & Confirmed') {
                return res.status(400).json({ message: 'Cannot update an order that has been confirmed as received by the user.' });
            }
            if (order.orderStatus === 'Cancelled') {
                return res.status(400).json({ message: 'Cannot update a cancelled order.' });
            }

            if (orderStatus) order.orderStatus = orderStatus;
            if (deliveryOption) order.deliveryOption = deliveryOption;
            if (adminMessage !== undefined) order.adminMessage = adminMessage;

            order.updatedAt = Date.now();
            await order.save();
            res.status(200).json({ message: '✅ Order updated successfully!', order });
        } catch (err) {
            console.error('❌ Error updating order:', err);
            if (err.name === 'CastError') {
                return res.status(400).json({ message: 'Invalid Order ID format.' });
            }
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({ message: 'Validation Error', errors: messages });
            }
            res.status(500).json({ message: '❌ Failed to update order.', error: err.message });
        }
    });

    app.put('/api/orders/:id/confirm-received', async (req, res) => {
        try {
            const { id } = req.params;

            const order = await Order.findById(id);

            if (!order) {
                return res.status(404).json({ message: 'Order not found.' });
            }

            if (order.orderStatus === 'Delivered & Confirmed' || order.orderStatus === 'Cancelled') {
                return res.status(400).json({ message: 'Order cannot be confirmed (already confirmed or cancelled).' });
            }

            order.orderStatus = 'Delivered & Confirmed';
            order.deliveredAt = new Date();
            order.updatedAt = new Date();

            await order.save();
            res.status(200).json({ message: '✅ Order marked as received successfully!', order });

        } catch (err) {
            console.error('❌ Error confirming order receipt:', err);
            if (err.name === 'CastError') {
                return res.status(400).json({ message: 'Invalid Order ID format.' });
            }
            res.status(500).json({ message: '❌ Failed to confirm order receipt.', error: err.message });
        }
    });

    app.put('/api/orders/:id/cancel', async (req, res) => {
        try {
            const { id } = req.params;

            const order = await Order.findById(id);

            if (!order) {
                return res.status(404).json({ message: 'Order not found.' });
            }

            if (order.orderStatus === 'Delivered & Confirmed' || order.orderStatus === 'Cancelled' || order.orderStatus === 'Delivered' || order.orderStatus === 'Shipped') {
                return res.status(400).json({ message: 'Order cannot be cancelled at this stage (already processed or shipped).' });
            }

            const cancellableDeliveryOptions = [
                'Option 1 - 5 days to delivery',
                'Option 2 - 3 days to delivery'
            ];

            if (!cancellableDeliveryOptions.includes(order.deliveryOption)) {
                return res.status(400).json({ message: 'Order can no longer be cancelled (past early delivery stages).' });
            }

            order.orderStatus = 'Cancelled';
            order.cancelledAt = new Date();
            order.updatedAt = new Date();

            await order.save();
            res.status(200).json({ message: '✅ Order cancelled successfully!', order });

        } catch (err) {
            console.error('❌ Error cancelling order:', err);
            if (err.name === 'CastError') {
                return res.status(400).json({ message: 'Invalid Order ID format' });
            }
            res.status(500).json({ message: '❌ Failed to cancel order.', error: err.message });
      }
    });

    // --- API Routes for Reviews ---
    app.post('/api/reviews', async (req, res) => {
      try {
        const { productId, userId, rating, comment } = req.body;

        if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({ message: 'Invalid Product ID or User ID.' });
        }
        if (rating === undefined || rating < 1 || rating > 5) {
          return res.status(400).json({ message: 'Rating must be between 1 and 5 stars.' });
        }

        const existingReview = await Review.findOne({ productId, userId });
        if (existingReview) {
          return res.status(409).json({ message: 'You have already submitted a review for this product.' });
        }

        const hasPurchasedAndConfirmed = await Order.exists({
            userId: userId,
            'products.productId': productId,
            orderStatus: 'Delivered & Confirmed'
        });

        if (!hasPurchasedAndConfirmed) {
            return res.status(403).json({ message: 'You can only review products you have purchased and confirmed receipt of.' });
        }

        const newReview = new Review({
          productId,
          userId,
          rating,
          comment: comment || '',
        });

        await newReview.save();
        res.status(201).json({ message: '✅ Review submitted successfully!', review: newReview });

      } catch (err) {
        console.error('❌ Error submitting review:', err);
        if (err.name === 'ValidationError') {
          const messages = Object.values(err.errors).map(val => val.message);
          return res.status(400).json({ message: 'Validation Error', errors: messages });
        }
        res.status(500).json({ message: '❌ Failed to submit review.', error: err.message });
      }
    });

    app.get('/api/reviews/:productId', async (req, res) => {
      try {
        const { productId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
          return res.status(400).json({ message: 'Invalid Product ID.' });
        }

        const reviews = await Review.find({ productId }).populate('userId', 'username');

        const formattedReviews = reviews.map(review => ({
          _id: review._id,
          productId: review.productId,
          userId: review.userId ? review.userId._id : null,
          username: review.userId ? review.userId.username : 'Deleted User',
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
        }));

        res.status(200).json(formattedReviews);
      } catch (err) {
        console.error('❌ Error fetching reviews:', err);
        if (err.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid product ID format' });
        }
        res.status(500).json({ message: '❌ Failed to fetch reviews.', error: err.message });
      }
    });

    // --- Admin Specific API Routes ---
    app.post('/api/admin/login', async (req, res) => {
        const { username, password } = req.body;

        // --- IMPORTANT: For production, hash passwords and store them securely! ---
        // For this demo, we're using hardcoded values as requested.
        const ADMIN_USERNAME = 'slugma';
        const ADMIN_PASSWORD = 'firepokemon'; // In real app: this would be a hashed password

        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            // In a real app, you'd generate a JWT or set a session here
            res.status(200).json({ message: '✅ Admin login successful!', token: 'admin-auth-token-example' });
        } else {
            res.status(401).json({ message: '❌ Invalid admin credentials' });
        }
    });


    // --- Server Start ---
    const PORT = 3001;
    const HOST = '0.0.0.0';

    app.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on http://localhost:${PORT} (accessible from frontend via http://localhost:${PORT})`);
      console.log(`Actual listening address: http://${HOST}:${PORT}`);
    });

  } catch (err) {
    console.error('❌ Failed to connect to MongoDB or start server:', err);
    process.exit(1);
  }
}

connectDbAndStartServer();
