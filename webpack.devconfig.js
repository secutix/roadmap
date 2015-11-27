var path = require('path');

module.exports = {
	devtool: 'source-map',
	resolve: {
		root: __dirname + '/source'
	},
	entry: './source/js/roadmap.js',
	output: {
		path: path.join(__dirname, 'dist'),
		filename: 'roadmap.js'
	},
	module: {
		loaders: [{
			test: /\.js$/,
			loader: 'babel-loader',
			include: path.join(__dirname, 'source')
		}]
	}
};
