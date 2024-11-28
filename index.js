const cors = require('cors');
const express = require('express');
require('./db');

const ShopifyModel = require('./shopify.model');
const PORT = 6001;
const app = express();

app.use(cors());
app.use(express.json())

app.get('/', (req, res) => {
  res.send('welcome...')
})

app.post('/api/track', async (req, res) => {
  try {
    const { config } = req.body;
    res.status(200).json({ message: 'Ok' });
    await ShopifyModel.create({ user_id: config.UID, url: config.URL, config });
    return;
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
    return;
  }
})

app.get('/api/track/get', async (req, res) => {
  try {
    const res = await ShopifyModel.find({});
    res.status(200).json(res);
    return;
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
    return;
  }
})

app.listen(PORT, async () => {
  console.log(`APP IS LISTEN ON ${PORT}`);
})

