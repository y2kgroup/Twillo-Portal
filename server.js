require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Import the API app (same code used in Vercel serverless)
const apiApp = require('./api/index');

// Mount everything under / (local dev) instead of /api and /webhooks separately
// The api/index.js exports routes with /api/ and /webhooks/ prefixes
app.use('/', apiApp);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Start server
app.listen(PORT, () => {
  console.log(`Twillo Y2K Portal running on http://localhost:${PORT}`);
});
