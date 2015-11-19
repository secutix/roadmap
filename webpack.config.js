var path = require('path');
var webpack = require('webpack');

module.exports = {
	devtool: 'source-map',
	resolve: {
		root: __dirname + '/source'
	},
	entry: './source/roadmap.js',
	output: {
		path: path.join(__dirname, 'dist'),
		filename: 'roadmap.js'
	},
	plugins: [
		new webpack.optimize.UglifyJsPlugin({
			compressor: {
				warnings: false
			}
		})
	],
	module: {
		loaders: [{
			test: /\.js$/,
			loader: 'babel-loader',
			include: path.join(__dirname, 'source')
		}]
	}
};
