// external packages
const { v4: uuid } = require('uuid');
const mongoose = require('mongoose');
const { Schema } = require('mongoose');

function getDatetimeInIST() {
  const utcDatetime = new Date();
  const istDatetime = new Date(utcDatetime.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return istDatetime.toISOString();
}

const shopifyLogsSchema = new Schema({
  id: {
    type: String,
    default: uuid
  },
  user_id: {
    type: String,
    trim: true
  },
  url: {
    type: String,
    trim: true
  },
  config: {
    type: Object
  },
  created_on: {
    type: Date,
    default: getDatetimeInIST
  }
}, { timestamps: false });

module.exports = mongoose.model('shopify_logs', shopifyLogsSchema);

