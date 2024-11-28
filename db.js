// external packages
const mongoose = require('mongoose');
mongoose.set('strictQuery', false);
// establish a connection to MongoDB
mongoose.connect(process.env.DB_URL || 'mongodb://127.0.0.1:27017/shopify', {})
  .then(() => console.log('Connected to MongoDB...'))
  .catch((err) => console.error('Could not connect to MongoDB...', err));
