const express = require('express');
const { compareConfig } = require('./scripts/compare-config');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/compare', (req, res) => {
  try {
    const result = compareConfig();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'Config Drift API',
    message: 'Use /compare to compare default-config.json with the previous release.',
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Config drift API running on http://localhost:${PORT}`);
  });
}

module.exports = { app, compareConfig };
