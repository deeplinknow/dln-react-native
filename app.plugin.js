// Expo config plugin entry point
// This file is required for Expo to recognize this package as a config plugin
const plugin = require('./plugin/build/index.js');

// Export the default export from the plugin
module.exports = plugin.default || plugin;
