const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});

const CropSchema = new mongoose.Schema({
  name: { type: String, required: true },
  season: { type: String, required: true },
  area: { type: Number, required: true },
  yieldRecords: [{
    amount: { type: Number },
    unit: { type: String, default: 'kg' },
    date: { type: Date, default: Date.now }
  }]
});

const LivestockSchema = new mongoose.Schema({
  type: { type: String, required: true },
  count: { type: Number, required: true },
  expenses: [{
    amount: { type: Number },
    description: { type: String },
    date: { type: Date, default: Date.now }
  }]
});

const InventorySchema = new mongoose.Schema({
  category: { type: String, required: true }, // Input Costs, Machinery, etc.
  subcategory: { type: String },
  amount: { type: Number, required: true },
  description: { type: String },
  date: { type: Date, default: Date.now }
});

const IncomeSchema = new mongoose.Schema({
  source: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now }
});

module.exports = {
  User: mongoose.model('User', UserSchema),
  Crop: mongoose.model('Crop', CropSchema),
  Livestock: mongoose.model('Livestock', LivestockSchema),
  Inventory: mongoose.model('Inventory', InventorySchema),
  Income: mongoose.model('Income', IncomeSchema)
};
