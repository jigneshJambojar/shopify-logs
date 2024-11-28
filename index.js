const cors = require('cors');
const express = require('express');
require('./db');
const Shopify = require('@shopify/shopify-api');


const ShopifyModel = require('./shopify.model');
const PORT = 9005;
const app = express();

app.use(cors());
app.use(express.json())

app.get('/', (req, res) => {
  res.send('welcome')
})

app.post('/api/track', async (req, res) => {
  try {
    const { config } = req.body;
    console.log(config);
    res.status(200).json({ message: 'Ok' });
    await ShopifyModel.create({ user_id: config.UID, url: config.URL, config });
    return;
  } catch (err) {
    console.log(err, '>>>>>>>>>>>>>>>')
    res.status(500).json({ message: 'Server error' });
    return;
  }
})

app.get('/api/track/get', async (req, res) => {
  try {
    const { config } = req.body;

    const response = await ShopifyModel.find({});
    res.status(200).json(response);
    return;
  } catch (err) {
    console.log(err, '>>>>>>>>>>>>>>>')
    res.status(500).json({ message: 'Server error' });
    return;
  }
})


app.post('/api/script', async (req, res) => {
  try {
    const { session, scriptUrl } = req.body;

    const client = new Shopify.Clients.Rest(session.shop, session.accessToken);

    // Step 1: Get the active theme
    const themes = await client.get({ path: 'themes' });
    const mainTheme = themes.body.themes.find(theme => theme.role === 'main');

    if (!mainTheme) {
      res.sendStatus(200).message(false);
      return;
    }

    // Step 2: Get the theme.liquid file
    const themeAsset = await client.get({
      path: `themes/${mainTheme.id}/assets`,
      query: { 'asset[key]': 'layout/theme.liquid' },
    });

    const content = themeAsset.body.asset.value;

    // Step 3: Add the script tag
    const updatedContent = content.replace(
      '</body>',
      `<script src="${scriptUrl}"></script>\n</body>`
    );

    // Step 4: Update the theme file
    await client.put({
      path: `themes/${mainTheme.id}/assets`,
      data: {
        asset: {
          key: 'layout/theme.liquid',
          value: updatedContent,
        },
      },
    });
    console.log('Script added successfully!');
    res.sendStatus(200).message({ status: true });
    return;
  } catch (err) {
    console.log(err, '>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    res.sendStatus(200).message({ status: false });
    return;
  }
})

app.listen(PORT, async () => {
  console.log(`APP IS LISTEN ON ${PORT}`);
})