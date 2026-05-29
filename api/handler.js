// Vercel serverless entry point
const app = require('./index');

// Export for Vercel serverless
module.exports = (req, res) => {
  app(req, res);
};
