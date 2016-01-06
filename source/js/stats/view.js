/*global c3:true*/

import * as helper from '../helper';
import './stats.scss';

let chart = null;
export function loadChart(columns) {
	if (!chart && c3) {
		chart = c3.generate({
			data: {
				x: 'x',
				columns: [
					['x'],
				],
				type: 'area-spline'
			},
			axis: {
				y: {
					padding: 0
				},
				x: {
					tick: {
						format: function(x) {
							var time = x * 10000;
							var date = new Date(time);
							return helper.format2(date.getHours()) + ':' + helper.format2(date.getMinutes());
						}
					}
				}
			},
			transition: {
				duration: 100
			}
		});
	}
	if (!chart) {
		return;
	}
	chart.load({
		columns: columns
	});
}
