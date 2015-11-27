/*global Firebase:true*/
import * as helper from './helper';
import * as view from './view';
import Room from './room';
import $ from 'jquery';

// DEV - PROD switch
const baseDomain = window.location.host.indexOf('localhost') !== -1 ? 'roadmap2' : 'amber-torch-7267';
const base = new Firebase('https://' + baseDomain + '.firebaseio.com/');

/**
 *
 * SHARED VARS
 *
 */

let currentRoom = null;
let showingStats = false;

/**
 *
 * FUNCTIONAL
 *
 */

function linkRoom(room) {
	let {
		roadmap, reference, threshold, history, presence
	} = room;
	roadmap.on('value', function(newStoreResp) {
		room.store = newStoreResp.val() || [];
		view.renderRoadmap(room.store, room.thresholdValue);
	});
	reference.on('value', function(data) {
		room.storeReference = data.val() || [];
		view.renderReference(room.storeReference, room.thresholdValue);
	});
	threshold.on('value', function(data) {
		room.thresholdValue = data.val();
		view.renderRoadmap(room.store, room.thresholdValue);
		view.renderReference(room.storeReference, room.thresholdValue);
	});
	history.limitToLast(1).on('child_added', function(childSnapshot) {
		var event = childSnapshot.val();
		room.store.forEach(function(text, index) {
			if (text === event.value) {
				view.renderActionNotification(index, event);
			}
		});
		// active user tracking
		$('#user_' + event.visa).removeClass('user-active');
		setTimeout(function() {
			$('#user_' + event.visa).addClass('user-active');
		}, 10);
	});
	presence.on('value', function(data) {
		if (data) {
			view.displayOnline(data.val());
		}
	});

	let historyLength = 0;
	history.on('child_added', function() {
		// show menu link if enough history
		if (historyLength !== -1) {
			if (historyLength++ > 10) {
				$('#nav_stats').removeClass('hidden');
				historyLength = -1;
			} else {
				$('#nav_stats').addClass('hidden');
			}
		}
	});
}


// login & presence
var visa;
base.onAuth(function(authData) {
	if (authData) {
		var uid = authData.uid;
		console.log('Authenticated user with uid:', uid);
		base.child('users/' + uid).on('value', function(data) {
			visa = data.val();

			// build room
			let hash = 'room_' + window.location.hash.replace(/[\#\.\[\]\$]/g, '');
			currentRoom = new Room(base, hash, visa);
			linkRoom(currentRoom);

			// update display
			view.roadmapView(visa);
		});
	} else {
		view.loginView();
	}
});


var times = [];
var users = {};
var nbPoints = 60;

// running
var statRules = [{
	id: 'active',
	fn: function(user) {
		return user.total;
	}
}, {
	id: 'up',
	fn: function(user) {
		return user.up * 100 / user.total;
	}
}, {
	id: 'ref',
	fn: function(user) {
		return user.toRef * 100 / user.total;
	}
}];

function showUserStats() {
	let userStats = currentRoom.userStats;
	var stats = statRules.map(function(rule) {
		return {
			id: rule.id,
			most: {
				value: null,
				visa: '???'
			},
			less: {
				value: null,
				visa: '???'
			}
		};
	});
	// compute results
	var handleRule = function(currentVisa) {
		return function(rule, index) {
			var value = rule.fn(userStats[currentVisa]);
			var stat = stats[index];
			var most = stat.most;
			var less = stat.less;
			if (most.value === null || value >= most.value) {
				most.value = value;
				most.visa = currentVisa;
			}
			if (less.value === null || value < less.value) {
				less.value = value;
				less.visa = currentVisa;
			}
		};
	};
	for (var userVisa in userStats) {
		statRules.forEach(handleRule(userVisa));
	}
	// display results
	stats.forEach(function(stat) {
		$('#stats_most_' + stat.id + ' .stats-card-visa').text(stat.most.visa);
		$('#stats_less_' + stat.id + ' .stats-card-visa').text(stat.less.visa);
	});
}

function showItemStats() {
	let totalSort = (a, b) => b.total - a.total;
	let itemStats = currentRoom.itemStats;
	// get top 3
	let items = Object.keys(itemStats).map(key => itemStats[key])
		.sort(totalSort);

	for (let index = 0; index < 3; index++) {
		let item = items[index];
		let $container = $(`#stats_item_${index}`);
		let $upContainer = $container.find('.stats-card-up');
		let $downContainer = $container.find('.stats-card-down');
		if (!item) {
			$container.addClass('hidden');
		} else {
			$container.removeClass('hidden')
				.find('.stats-card-name')
				.text(item.text)
				.attr('title', `${item.total} actions`);

			// find who vote for/against
			let upUser = Object.keys(item.upUsers).map(key => ({
				total: item.upUsers[key],
				visa: key
			})).sort(totalSort)[0];
			if (upUser) {
				$upContainer.removeClass('hidden').find('.stats-card-item-visa').text(upUser.visa);
			} else {
				$upContainer.addClass('hidden');
			}
			let downUser = Object.keys(item.downUsers).map(key => ({
				total: item.downUsers[key],
				visa: key
			})).sort(totalSort)[0];
			if (downUser) {
				$downContainer.removeClass('hidden').find('.stats-card-item-visa').text(downUser.visa);
			} else {
				$downContainer.addClass('hidden');
			}
		}
	}
}

setInterval(function() {

	if (!currentRoom) {
		return;
	}

	var time = Math.floor(Date.now() / 10000);
	var remaining = [];

	// initial build
	if (!times.length) {
		for (var i = 0; i < nbPoints; i++) {
			times.unshift(time - i);
		}
	}

	// build new time
	var index = times.indexOf(time);
	if (index === -1) {
		times.push(time);
		times.shift();
		for (var key in users) {
			var stats = users[key];
			stats.push(0);
			stats.shift();

		}
	}

	// reintegrate values
	currentRoom.savedStats.forEach(function(event) {
		var eventTime = Math.floor(event.time / 10000);
		var eventVisa = event.visa;
		var lastTime = times[times.length - 1];
		var timeIndex = times.indexOf(eventTime);
		// save this for later
		if (timeIndex === -1 && eventTime > lastTime) {
			remaining.push(event);
			return;
		}
		var currentStats = users[eventVisa];
		if (!currentStats) {
			currentStats = times.map(function() {
				return 0;
			});
			users[eventVisa] = currentStats;
		}
		var value = currentStats[index];
		currentStats[index] = !value ? 1 : value + 1;
	});
	currentRoom.savedStats = remaining;

	// dont process if not showing
	if (!showingStats) {
		return;
	}

	// propagate to chart
	var columns = [
		['x'].concat(times)
	];
	for (var user in users) {
		columns.push([user].concat(users[user]));
	}
	view.loadChart(columns);

	// update stats as well
	showUserStats();
	showItemStats();

}, 2000);

/**
 *
 * DOM HANDLERS
 *
 */
$(() => {
	// roadmap handlers
	$('#nav_admin').on('click', function() {
		$('#admin_block').toggleClass('hidden');
		$('#main').toggleClass('admin');
		$('#admin_roadmap_item').focus();
		return false;
	});
	$('#admin_add').on('submit', function() {
		var $item = $('#admin_roadmap_item');
		var value = $item.val();
		if (value) {
			currentRoom.store.push(value);
			$item.val('');
			currentRoom.broadcast();
		}
		return false;
	});
	$('#admin_threshold').on('submit', function() {
		var $item = $('#admin_roadmap_threshold');
		var value = parseInt($item.val(), 10);
		if (!isNaN(value)) {
			currentRoom.threshold.set(value);
			$item.val('');
		}
		return false;
	});
	$('#nav_reference').on('click', function() {
		currentRoom.reference.set(currentRoom.store);
		return false;
	});

	// upload / download
	$('#roadmap_items_download').on('click', function() {
		var content = JSON.stringify({
			ref: currentRoom.storeReference,
			store: currentRoom.store,
			threshold: currentRoom.thresholdValue
		});
		helper.downloadAsFile(new Blob([content], {
			type: 'application/json'
		}), 'roadmap.json');
		return false;
	});
	$('body')
		.on('dragover', function(event) {
			var originalEvent = event.originalEvent;
			originalEvent.dataTransfer.dropEffect = 'copy';
			return false;
		})
		.on('drop', function(event) {
			var originalEvent = event.originalEvent;
			var file = originalEvent.dataTransfer.files[0];
			var reader = new FileReader();
			reader.onload = function(e) {
				var data = null;
				try {
					data = JSON.parse(e.target.result);
				} catch (X_x) {
					return;
				}
				if (data) {
					currentRoom.threshold.set(data.threshold);
					currentRoom.reference.set(data.ref);
					currentRoom.store = data.store;
					currentRoom.broadcast();
				}
			};
			reader.readAsText(file);
			return false;
		});

	// items handlers
	function swap(direction) {
		return function() {
			var index = $(this).parents('.roadmap-item').data('index');
			if (index === null) {
				return false;
			}
			// swap values
			currentRoom.swap(index, direction, visa);
			return false;
		};
	}

	$('#roadmap_items')
		.on('click', '.roadmap-item-up', swap(-1))
		.on('click', '.roadmap-item-down', swap(1))
		.on('click', '.roadmap-item-delete', function() {
			var index = $(this).parents('.roadmap-item').data('index');
			currentRoom.store.splice(index, 1);
			currentRoom.broadcast();
			return false;
		})
		.on('dragstart', '.roadmap-item', function(event) {
			if (!$('#main').hasClass('admin')) {
				return false;
			}
			var originalEvent = event.originalEvent;
			var $item = $(this);
			$item.addClass('roadmap-item-dragging');
			originalEvent.dataTransfer.effectAllowed = 'move';
			originalEvent.dataTransfer.setData('application/json', JSON.stringify({
				index: $item.data('index'),
				item: $item.find('.roadmap-item-name').text()
			}));
			// delay target placeholder display, otherwise stops the drag because
			// of the next element
			setTimeout(function() {
				$('#roadmap_items .roadmap-item:not(.roadmap-item-dragging)').addClass('roadmap-item-drop-target');
			}, 100);
		})
		.on('dragenter', '.roadmap-item', function() {
			var $this = $(this);
			if ($this.hasClass('roadmap-item-drop-target')) {
				$(this).addClass('roadmap-item-drop-target-enter');
			}
		})
		.on('dragover', '.roadmap-item', function(event) {
			var originalEvent = event.originalEvent;
			originalEvent.dataTransfer.dropEffect = 'move';
			return false;
		})
		.on('dragleave', '.roadmap-item', function(event) {
			event.preventDefault();
			event.stopPropagation();
			var $this = $(this);
			$this.removeClass('roadmap-item-drop-target-enter');

		})
		.on('dragend', '.roadmap-item', function() {
			$(this).removeClass('roadmap-item-dragging');
			$('#roadmap_items .roadmap-item').removeClass('roadmap-item-drop-target')
				.removeClass('roadmap-item-drop-target-enter');
		})
		.on('drop', '.roadmap-item', function(event) {
			var originalEvent = event.originalEvent;
			var targetIndex = $(this).data('index');
			var originIndex = JSON.parse(originalEvent.dataTransfer.getData('application/json')).index;
			// no index : push at the end
			if (targetIndex !== 0 && !targetIndex) {
				targetIndex = currentRoom.store.length;
			}
			// removing will shift the index
			if (originIndex < targetIndex) {
				targetIndex--;
			}
			var item = currentRoom.store.splice(originIndex, 1);
			currentRoom.store.splice(targetIndex, 0, item);
			currentRoom.broadcast();
			return false;
		});

	// login handlers
	$('#welcome form').on('submit', function(event) {

		event.preventDefault();
		// toggle display
		$(this).hide();
		$('#welcome .progress').removeClass('hidden');
		var login = $('#visa_input').val();

		base.authAnonymously(function(error, authData) {
			if (error) {
				console.log('Authentication Failed!', error);
				return;
			}
			var uid = authData.uid;
			base.child('users/' + uid).set(login);
			$('#welcome').hide();
			$('#welcome form').show();
			$('#welcome').addClass('hidden');
			$('#welcome .progress').addClass('hidden');
		});
	});
	$('#nav_logout').on('click', function() {
		base.unauth();
		return false;
	});

	$('#nav_stats, #stats h2 .close').on('click', function() {
		$('#stats, #main').toggleClass('hidden');
		showingStats = !showingStats;
		if (showingStats) {
			showUserStats();
			showItemStats();
			if ($('#main').hasClass('admin')) {
				$('#nav_admin').trigger('click');
			}
		}
		return false;
	});
	$('#nav_toggle').on('click', function() {
		$('nav .navbar-right').toggleClass('hidden-xs');
	});

});
