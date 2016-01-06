// copy prod config
var config = require('./webpack.config');
// remove minification
config.plugins = null;

module.exports = config;
