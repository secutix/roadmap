var path = require('path');
var webpack = require('webpack');

module.exports = {
	devtool: 'source-map',
	context: path.join(__dirname, 'source'),
	entry: './js/roadmap.js',
	output: {
		path: path.join(__dirname, 'dist'),
		publicPath: '/dist/',
		filename: 'roadmap.js',
		chunkFilename: '[chunkhash].[name].js'
	},
	module: {
		loaders: [{
			test: /\.js$/,
			loader: 'babel-loader',
			include: path.join(__dirname, 'source')
		}, {
			test: /\.scss$/,
			loaders: ['style-loader', 'css-loader', 'sass-loader'],
			include: path.join(__dirname, 'source')
		}, {
			test: /\.(png|jpg|svg)$/,
			loader: 'file-loader',
			include: path.join(__dirname, 'source')
		}]
	},
	plugins: [
		new webpack.optimize.UglifyJsPlugin({
			minimize: true,
			compressor: {
				warnings: false
			}
		})
	]
};
