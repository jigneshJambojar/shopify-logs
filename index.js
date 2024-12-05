const cors = require('cors');
const express = require('express');
require('dotenv').config();
require('./db');
const Shopify = require('@shopify/shopify-api');
const { connectDB, closeDB } = require('./db');


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
    res.status(500).json({ message: 'Server error' });
    return;
  }
})

app.get('/api/track/get', async (req, res) => {
  try {
    const response = await ShopifyModel.find({});
    res.status(200).json(response);
    return;
  } catch (err) {
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
});

app.post('/api/get-cookies-data', async (req, res) => {
  try {
    const data = req.body;
    const shop = data.shop;
    const cartToken = data.cart_token;

    if (!shop) {
      return res.status(400).json({ status: 400, message: 'Shop is required.' });
    }

    if (!cartToken) {
      return res.status(400).json({ status: 400, message: 'Cart Token is required.' });
    }

    if (shop && cartToken) {
      const db = await connectDB();
      const collection = db.collection(process.env.JAMBOJAR_CART_DATA);

      // Query the database to get only the `cookies_data` field
      const result = await collection.findOne(
        {
          "shop": shop,
          "cart_data.cart_token": cartToken
        }
      );

      if (result && result.cart_data && Array.isArray(result.cart_data) && result.cart_data.length > 0) {
        // Clean the cart_token from request and compare with cleaned token from the DB
        const cleanedCartToken = cartToken.trim();

        const cartData = result.cart_data.find(cart => cart.cart_token.trim() === cleanedCartToken);

        if (cartData && cartData.cookies_data) {
          return res.status(200).json({ status: 200, message: 'Cookies data fetched successfully', data: cartData.cookies_data });
        } else {
          return res.status(404).json({ status: 404, message: 'Cookies data not found for the provided cart token.' });
        }
      } else {
        return res.status(404).json({ status: 404, message: 'No data found for the provided shop and cart token.' });
      }
    } else {
      return res.status(401).json({ message: "Session not found" });
    }
  } catch (error) {
    console.error('Error getting cookies data:', error.message);
    return res.status(500).json({ status: 500, message: 'Error getting cookies data', error: error.message });
  }
});

// POST request to create a cookies to db
app.post('/api/set-cookies-data', async (req, res) => {
  try {
    const data = req.body;

    const shop = data.shop;
    const cartToken = data.cart_token;
    const sessionCookie = data.cookies_data;

    // Validate required fields
    if (!shop) {
      return res.status(400).json({ status: 400, message: 'Shop is required.' });
    }
    if (!cartToken) {
      return res.status(400).json({ status: 400, message: 'Cart Token is required.' });
    }

    const db = await connectDB();
    const collection = db.collection(process.env.JAMBOJAR_CART_DATA);

    // Find the document by shop
    const existingShopData = await collection.findOne({ shop: shop });

    if (!existingShopData) {
      // If the shop does not exist, create a new row with cart_data
      const newDocument = {
        shop: shop,
        cart_data: [
          {
            cart_token: cartToken,
            cookies_data: sessionCookie,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
        ],
      };

      await collection.insertOne(newDocument);

      return res.status(200).json({
        status: 200,
        message: 'New shop record created with cart data.'
      });
    } else {
      // Shop exists, check for cartToken in cart_data
      const cartDataIndex = existingShopData.cart_data.findIndex(
        (cart) => cart.cart_token === cartToken
      );

      if (cartDataIndex === -1) {
        // If cartToken does not exist, add a new object to cart_data
        const newCartData = {
          cart_token: cartToken,
          cookies_data: sessionCookie,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await collection.updateOne(
          { shop: shop },
          { $push: { cart_data: newCartData } }
        );

        return res.status(200).json({
          status: 200,
          message: 'New cart data added to existing shop.'
        });
      } else {
        // CartToken exists, check if cookiesData has changes
        const existingCartData = existingShopData.cart_data[cartDataIndex];

        if (
          JSON.stringify(existingCartData.cookies_data) !==
          JSON.stringify(sessionCookie)
        ) {
          // Update only if cookiesData has changed
          existingCartData.cookies_data = sessionCookie;
          existingCartData.updated_at = new Date().toISOString();

          await collection.updateOne(
            { shop: shop, "cart_data.cart_token": cartToken },
            { $set: { "cart_data.$.cookies_data": existingCartData.cookies_data, "cart_data.$.updated_at": existingCartData.updated_at } }
          );

          return res.status(200).json({
            status: 200,
            message: 'Cart data updated for existing cart token.'
          });
        } else {
          // No changes detected
          return res.status(200).json({
            status: 200,
            message: 'No changes detected for existing cart token.'
          });
        }
      }
    }
  } catch (error) {
    console.error('Error managing cart session data:', error.message);
    res.status(500).json({
      status: 500,
      message: 'Error managing cart session data',
      error: error.message,
    });
  }
});

app.post('/api/save-orders', async (req, res) => {
  try {
    const data = req.body; // Get the request body
    const { shop, order_id, order_url, cart_token, payment_status, billing_status, billing_amount, app_credit_amount } = data; // Destructure the fields

    // Validate required fields
    if (!shop || !order_id) {
      return res.status(400).json({ status: 400, message: 'Fields "shop" and "order_id" are required.' });
    }

    // Get current timestamp for created_at and updated_at
    const currentTimestamp = new Date();

    // Connect to the database
    const db = await connectDB();
    const collection = db.collection(process.env.JAMBOJAR_ORDERS);

    // Find the shop's document
    const existingShop = await collection.findOne({ shop });

    if (existingShop) {
      // Shop exists, check if the order already exists in the orders array
      const existingOrderIndex = existingShop.orders.findIndex(order => order.order_id === order_id);

      if (existingOrderIndex !== -1) {
        // If order exists, prepare the fields to update conditionally
        const updateFields = {};
        if (order_url) updateFields["orders.$.order_url"] = order_url;
        if (cart_token) updateFields["orders.$.cart_token"] = cart_token;
        if (payment_status) updateFields["orders.$.payment_status"] = payment_status;
        if (billing_status) updateFields["orders.$.billing_status"] = billing_status;
        if (billing_amount) updateFields["orders.$.billing_amount"] = billing_amount;
        if (app_credit_amount) updateFields["orders.$.app_credit_amount"] = app_credit_amount;
        updateFields["orders.$.updated_at"] = currentTimestamp;

        // Update the order in the array
        await collection.updateOne(
          { shop, "orders.order_id": order_id },
          { $set: updateFields }
        );
      } else {
        // If the order doesn't exist in the array, add it
        await collection.updateOne(
          { shop },
          {
            $push: {
              orders: {
                order_id,
                order_url: order_url || null,
                cart_token: cart_token || null,
                payment_status: payment_status || null,
                billing_status: billing_status || null,
                billing_amount: billing_amount || null,
                app_credit_amount: app_credit_amount || null,
                created_at: currentTimestamp,
                updated_at: currentTimestamp
              }
            }
          }
        );
      }
    } else {
      // Shop doesn't exist, create a new shop document with the order
      await collection.insertOne({
        shop,
        orders: [
          {
            order_id,
            order_url: order_url || null,
            cart_token: cart_token || null,
            payment_status: payment_status || null,
            billing_status: billing_status || null,
            billing_amount: billing_amount || null,
            app_credit_amount: app_credit_amount || null,
            created_at: currentTimestamp,
            updated_at: currentTimestamp
          }
        ],
      });
    }

    // Respond with success
    return res.status(200).json({ status: 200, message: 'Order processed successfully.' });

  } catch (error) {
    // Log and handle errors
    console.error('Error saving or updating order data:', error.message);
    res.status(500).json({ status: 500, message: 'Error saving or updating order data', error: error.message });
  }
});

// GET request to fetch orders with only order_id and order_url
app.post('/api/get-cart-token', async (req, res) => {
  try {
    const { shop, order_id } = req.body;

    if (!shop || !order_id) {
      return res.status(400).json({ status: 400, message: 'Shop and order_id are required.' });
    }

    let normalizedShop = shop.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Connect to the database
    const db = await connectDB();
    const collection = db.collection(process.env.JAMBOJAR_ORDERS);

    // Convert order_id to both string and number
    const orderIdNumber = Number(order_id);
    const orderIdString = String(order_id);

    // Query for the order, checking both number and string types
    const order = await collection.findOne({
      shop: { $regex: normalizedShop, $options: 'i' },
      $or: [
        { "orders.order_id": orderIdNumber }, // Match order_id as number
        { "orders.order_id": orderIdString } // Match order_id as string
      ]
    });

    if (order) {
      // Find the order in the orders array that matches the order_id (as string or number)
      const foundOrder = order.orders.find(
        o => o.order_id === orderIdNumber || o.order_id === orderIdString
      );

      if (foundOrder && foundOrder.cart_token) {
        return res.status(200).json({
          status: 200,
          message: 'Cart token fetched successfully.',
          data: foundOrder.cart_token
        });
      } else {
        return res.status(404).json({ status: 404, message: 'Cart token not found for the given order_id.' });
      }
    } else {
      return res.status(404).json({ status: 404, message: 'Order not found for the given order_id.' });
    }

  } catch (error) {
    console.error('Error fetching cart token:', error.message);
    res.status(500).json({ status: 500, message: 'Error fetching cart token', error: error.message });
  }
});

app.get('/api/get-orders', async (req, res) => {
  try {
    // Get the 'shop' query parameter from the request
    let { shop } = req.query;

    // Check if the 'shop' parameter is provided
    if (!shop) {
      return res.status(400).json({ status: 400, message: 'Shop parameter is required.' });
    }

    // Normalize the shop parameter by removing 'https://' or 'http://'
    shop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Connect to the database
    const db = await connectDB();
    const collection = db.collection(process.env.JAMBOJAR_ORDERS);

    // Fetch the document for the specified shop
    const shopData = await collection.findOne({ shop });

    // Check if the shop exists
    if (!shopData) {
      return res.status(404).json({ status: 404, message: `No orders found for shop: ${shop}.` });
    }

    // Respond with the orders data for the specified shop
    res.status(200).json({ status: 200, message: 'Orders retrieved successfully.', data: shopData.orders });
  } catch (error) {
    // Log and handle errors
    console.error('Error retrieving order data:', error.message);
    res.status(500).json({ status: 500, message: 'Error retrieving order data', error: error.message });
  }
});

app.post('/api/save-app-settings', async (req, res) => {
  const { shop, subscription, ...additionalFields } = req.body; // Capture subscription and any other fields dynamically

  if (!shop || !subscription) {
    console.error('Missing required fields:', { shop, subscription });
    return res.status(400).json({
      status: 400,
      message: 'Missing shop or subscription in the request body.',
    });
  }

  try {
    // Connect to the database
    const db = await connectDB();
    const collection = db.collection(process.env.JAMBOJAR_APP_DATA);

    // Check if the shop exists in the collection
    const existingRecord = await collection.findOne({ shop });

    if (!existingRecord) {
      return res.status(404).json({
        status: 404,
        message: 'Shop does not exist in the collection.',
      });
    }

    // Ensure app_settings is an array (initialize if necessary)
    if (!Array.isArray(existingRecord.app_settings)) {
      // If app_settings is not an array, initialize it as an empty array
      existingRecord.app_settings = [];
    }

    // Ensure that app_settings contains at least one object (first item)
    if (existingRecord.app_settings.length === 0 || typeof existingRecord.app_settings[0] !== 'object') {
      // If app_settings is empty or its first item is not an object, initialize it with a subscription array
      existingRecord.app_settings.push({
        subscription: [],
      });
    }

    // Ensure that the subscription array exists inside the first item of app_settings
    const appSettingsFirstItem = existingRecord.app_settings[0];

    if (!appSettingsFirstItem.subscription) {
      appSettingsFirstItem.subscription = [];  // Initialize subscription as an empty array
    }

    // Check if the subscription with the same ID already exists in the array
    const subscriptionIndex = appSettingsFirstItem.subscription.findIndex(
      (sub) => sub.id === subscription.id
    );

    if (subscriptionIndex !== -1) {
      // Subscription ID exists, update it
      appSettingsFirstItem.subscription[subscriptionIndex] = subscription;

      // Add additional fields outside of subscription
      Object.keys(additionalFields).forEach(key => {
        appSettingsFirstItem[key] = additionalFields[key]; // Add each additional field dynamically
      });

      // Save the updated record with the current timestamp in updated_at
      await collection.updateOne(
        { shop },
        {
          $set: {
            'app_settings': existingRecord.app_settings,
            updated_at: new Date(),  // Update the updated_at field with current timestamp
          },
        }
      );

      return res.status(200).json({
        status: 200,
        message: 'App settings updated successfully.',
      });
    } else {
      // Subscription ID doesn't exist, add a new subscription
      await collection.updateOne(
        { shop },
        {
          $push: {
            'app_settings.0.subscription': subscription,
          },
          $set: {
            updated_at: new Date(),  // Update the updated_at field with current timestamp
          },
        }
      );

      // Use a 'for...in' loop instead of 'forEach' so we can await inside the loop
      Object.keys(additionalFields).forEach(async (key) => {
        await collection.updateOne(
          { shop },
          {
            $set: {
              [`app_settings.0.${key}`]: additionalFields[key], // Dynamically add the field at the root of app_settings
            },
          }
        );
      });

      return res.status(200).json({
        status: 200,
        message: 'App settings saved successfully with new subscription.',
      });
    }
  } catch (error) {
    console.error('Error saving app settings:', error.message);
    res.status(500).json({
      status: 500,
      message: 'Error saving app settings',
      error: error.message,
    });
  }
});

app.get('/api/jambojar/setting', async (req, res) => {
  try {
    res.status(200).json({ margin: 20, conv_rate: 80 });
    return;
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
    return;
  }
})

app.listen(PORT, async () => {
  console.log(`APP IS LISTEN ON ${PORT}`);
})