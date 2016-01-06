/*global Firebase,require:true*/

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
let visa = null;
let roomName = null;

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
		setTimeout(() => $('#user_' + event.visa).addClass('user-active'), 10);
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
base.onAuth(function(authData) {
	let hash = window.location.hash.replace(/[\#\.\[\]\$]/g, '');
	if (authData) {
		let uid = authData.uid;
		console.log('Authenticated user with uid:', uid);
		base.child('users/' + uid).on('value', function(data) {
			visa = data.val();
			roomName = $('#room_input').val();

			// build room
			if (!hash) {
				if (roomName) {
					let ref = base.child('rooms').push();
					ref.set(roomName);
					hash = ref.toString().replace(/.*\/([^\/]+)$/g, '$1');
					window.location.hash = hash;
					$('#new_room_overlay').removeClass('hidden');
					$('#new_room_link').attr('href', window.location.href)
						.text(window.location.href);
				} else {
					// logout
					base.unauth();
					return;
				}
			}

			base.child('rooms/' + hash).once('value', function(roomData) {
				roomName = roomData.val();
				// room does not exists
				if (!roomName) {
					// logout
					base.unauth();
					return;
				}
				currentRoom = new Room(base, 'room_' + hash, visa);
				linkRoom(currentRoom);
				// update display
				view.roadmapView(visa, roomName);
			});

		});
	} else {
		view.loginView(hash);
	}
});


let times = [];
let users = {};
let nbPoints = 60;

// running
let statRules = [{
	id: 'active',
	fn: (user) => user.total
}, {
	id: 'up',
	fn: (user) => user.up * 100 / user.total
}, {
	id: 'ref',
	fn: (user) => user.toRef * 100 / user.total
}];

function showUserStats() {
	let userStats = currentRoom.userStats;
	let stats = statRules.map((rule) => ({
		id: rule.id,
		most: {
			value: null,
			visa: '???'
		},
		less: {
			value: null,
			visa: '???'
		}
	}));

	// compute results
	let handleRule = function(currentVisa) {
		return function(rule, index) {
			let value = rule.fn(userStats[currentVisa]);
			let stat = stats[index];
			let most = stat.most;
			let less = stat.less;
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
	for (let userVisa in userStats) {
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

	let time = Math.floor(Date.now() / 10000);
	let remaining = [];

	// initial build
	if (!times.length) {
		for (let i = 0; i < nbPoints; i++) {
			times.unshift(time - i);
		}
	}

	// build new time
	let index = times.indexOf(time);
	if (index === -1) {
		times.push(time);
		times.shift();
		for (let key in users) {
			let stats = users[key];
			stats.push(0);
			stats.shift();

		}
	}

	// reintegrate values
	currentRoom.savedStats.forEach(function(event) {
		let eventTime = Math.floor(event.time / 10000);
		let eventVisa = event.visa;
		let lastTime = times[times.length - 1];
		let timeIndex = times.indexOf(eventTime);
		// save this for later
		if (timeIndex === -1 && eventTime > lastTime) {
			remaining.push(event);
			return;
		}
		let currentStats = users[eventVisa];
		if (!currentStats) {
			currentStats = times.map(function() {
				return 0;
			});
			users[eventVisa] = currentStats;
		}
		let value = currentStats[index];
		currentStats[index] = !value ? 1 : value + 1;
	});
	currentRoom.savedStats = remaining;

	// dont process if not showing
	if (!showingStats) {
		return;
	}

	// propagate to chart
	let columns = [
		['x'].concat(times)
	];
	for (let user in users) {
		columns.push([user].concat(users[user]));
	}

	require.ensure('./stats/view', function(require) {
		require('./stats/view').loadChart(columns);
	});

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
		let $item = $('#admin_roadmap_item');
		let value = $item.val();
		if (value) {
			currentRoom.store.push(value);
			$item.val('');
			currentRoom.broadcast();
		}
		return false;
	});
	$('#admin_threshold').on('submit', function() {
		let $item = $('#admin_roadmap_threshold');
		let value = parseInt($item.val(), 10);
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
		let content = JSON.stringify({
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
			let originalEvent = event.originalEvent;
			originalEvent.dataTransfer.dropEffect = 'copy';
			return false;
		})
		.on('drop', function(event) {
			let originalEvent = event.originalEvent;
			let file = originalEvent.dataTransfer.files[0];
			let reader = new FileReader();
			reader.onload = function(e) {
				let data = null;
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
			let index = $(this).parents('.roadmap-item').data('index');
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
			let index = $(this).parents('.roadmap-item').data('index');
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
		$(this).addClass('hidden');
		$('#welcome .progress').removeClass('hidden');
		var login = $('#visa_input').val();

		base.authAnonymously(function(error, authData) {
			if (error) {
				console.log('Authentication Failed!', error);
				return;
			}
			var uid = authData.uid;
			base.child('users/' + uid).set(login);
		});
	});
	$('#nav_logout').on('click', function() {
		base.unauth();
		return false;
	});

	$('#nav_stats, #stats h2 .close').on('click', function() {
		if (showingStats) {
			$('#stats, #main').toggleClass('hidden');
			showingStats = false;
		} else {
			require.ensure('./stats/view', function(require) {
				require('./stats/view');
				$('#stats, #main').toggleClass('hidden');
				showingStats = true;
				showUserStats();
				showItemStats();
				if ($('#main').hasClass('admin')) {
					$('#nav_admin').trigger('click');
				}
			});
		}

		return false;
	});
	$('#nav_toggle').on('click', function() {
		$('nav .navbar-right').toggleClass('hidden-xs');
		return false;
	});

	// new room handlers
	$('#new_room_continue').on('click', function() {
		$('#new_room_overlay').addClass('hidden');
		return false;
	});

});
