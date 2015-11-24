/*global $ Firebase c3:true*/
import * as helper from './helper';
import * as view from './view';

$(function() {

	var hash = 'room_' + window.location.hash.replace(/[\#\.\[\]\$]/g, '');
	// DEV - PROD switch
	var baseDomain = window.location.host.indexOf('localhost') !== -1 ? 'roadmap2' : 'amber-torch-7267';

	var base = new Firebase('https://' + baseDomain + '.firebaseio.com/');
	var room = base.child(hash);
	var roadmap = room.child('roadmap');
	var reference = room.child('reference');
	var threshold = room.child('threshold');
	var history = room.child('history');
	var presence = room.child('presence');

	/**
	 *
	 * SHARED VARS
	 *
	 */

	var store = [];
	var storeReference = [];
	var thresholdValue = 0;
	var showingStats = false;

	/**
	 *
	 * FUNCTIONAL
	 *
	 */

	roadmap.on('value', function(newStoreResp) {
		store = newStoreResp.val() || [];
		view.renderRoadmap(store, thresholdValue);
	});
	reference.on('value', function(data) {
		storeReference = data.val() || [];
		view.renderReference(storeReference, thresholdValue);

	});
	threshold.on('value', function(data) {
		thresholdValue = data.val();
		view.renderRoadmap(store, thresholdValue);
		view.renderReference(storeReference, thresholdValue);
	});

	function broadcast() {
		roadmap.set(store);
	}
	history.limitToLast(1).on('child_added', function(childSnapshot) {
		var event = childSnapshot.val();
		store.forEach(function(text, index) {
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

	// login & presence
	var visa;
	base.onAuth(function(authData) {
		if (authData) {
			var uid = authData.uid;
			console.log('Authenticated user with uid:', uid);
			base.child('users/' + uid).on('value', function(data) {
				visa = data.val();
				$('#main, nav, footer').removeClass('hidden');
				$('#welcome').addClass('hidden');
				$('#visa').text(visa);

				//  online status
				var amOnline = base.child('.info/connected');
				var userRef = room.child('presence/' + visa);
				amOnline.on('value', function(snapshot) {
					if (snapshot.val()) {
						userRef.onDisconnect().remove();
						userRef.set(true);
					}
				});
			});
		} else {
			$('#welcome').removeClass('hidden');
			$('#visa_input').focus();
			$('#main, #stats, nav, footer').addClass('hidden');
			$('#admin_block').addClass('hidden');
		}
	});
	presence.on('value', function(data) {
		if (data) {
			view.displayOnline(data.val());
		}
	});

	/**
	 *
	 * CHARTING
	 *
	 */
	var chart = c3.generate({
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

	var times = [];
	var saved = [];
	var users = {};
	var userStats = {};
	var nbPoints = 60;

	history.on('child_added', function(childSnapshot) {
		var event = childSnapshot.val();
		saved.push(event);
		// update user stats
		var eventVisa = event.visa;
		var user = userStats[eventVisa];
		if (!user) {
			user = {
				up: 0,
				down: 0,
				total: 0,
				toRef: 0,
				againstRef: 0
			};
			userStats[eventVisa] = user;
		}
		user.total++;
		if (event.direction > 0) {
			user.down++;
			if (event.index >= event.refIndex) {
				user.againstRef++;
			} else {
				user.toRef++;
			}
		} else {
			user.up++;
			if (event.index <= event.refIndex) {
				user.againstRef++;
			} else {
				user.toRef++;
			}
		}
	});
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

	function showStats() {
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
		var handleRule = function(userVisa) {
			return function(rule, index) {
				var value = rule.fn(userStats[userVisa]);
				var stat = stats[index];
				var most = stat.most;
				var less = stat.less;
				if (most.value === null || value >= most.value) {
					most.value = value;
					most.userVisa = userVisa;
				}
				if (less.value === null || value < less.value) {
					less.value = value;
					less.userVisa = userVisa;
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

	setInterval(function() {
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
			Object.keys(users).forEach((key) => {
				var stats = users[key];
				stats.push(0);
				stats.shift();
			});
		}

		// reintegrate values
		saved.forEach(function(event) {
			var eventTime = Math.floor(event.time / 10000);
			var eventVisa = event.visa;
			var lastTime = times[times.length - 1];
			var timeIndex = times.indexOf(eventTime);
			// save this for later
			if (timeIndex === -1 && time > lastTime) {
				remaining.push(event);
				return;
			}
			var stats = users[eventVisa];
			if (!stats) {
				stats = times.map(function() {
					return 0;
				});
				users[eventVisa] = stats;
			}
			var value = stats[timeIndex];
			stats[timeIndex] = !value ? 1 : value + 1;
		});
		saved = remaining;

		// dont process if not showing
		if (!showingStats) {
			return false;
		}

		// propagate to chart
		var columns = [
			['x'].concat(times)
		];
		for (var user in users) {
			columns.push([user].concat(users[user]));
		}
		chart.load({
			columns: columns
		});
		// update stats as well
		showStats();
	}, 2000);

	/**
	 *
	 * DOM HANDLERS
	 *
	 */

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
			store.push(value);
			$item.val('');
			broadcast();
		}
		return false;
	});
	$('#admin_threshold').on('submit', function() {
		var $item = $('#admin_roadmap_threshold');
		var value = parseInt($item.val(), 10);
		if (!isNaN(value)) {
			threshold.set(value);
			$item.val('');
		}
		return false;
	});
	$('#nav_reference').on('click', function() {
		reference.set(store);
		return false;
	});

	// upload / download
	$('#roadmap_items_download').on('click', function() {
		var content = JSON.stringify({
			ref: storeReference,
			store: store,
			threshold: thresholdValue
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
					threshold.set(data.threshold);
					reference.set(data.ref);
					store = data.store;
					broadcast();
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
			var value = store[index];
			store[index] = store[index + direction];
			store[index + direction] = value;
			broadcast();
			// also save changed
			if (visa) {
				var refIndex = storeReference.indexOf(value);
				var historyRef = history.push();
				historyRef.set({
					visa: visa,
					index: index,
					refIndex: refIndex,
					value: value,
					time: Firebase.ServerValue.TIMESTAMP,
					direction: direction
				});
			}
			return false;
		};
	}

	$('#roadmap_items')
		.on('click', '.roadmap-item-up', swap(-1))
		.on('click', '.roadmap-item-down', swap(1))
		.on('click', '.roadmap-item-delete', function() {
			var index = $(this).parents('.roadmap-item').data('index');
			store.splice(index, 1);
			broadcast();
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
				targetIndex = store.length;
			}
			// removing will shift the index
			if (originIndex < targetIndex) {
				targetIndex--;
			}
			var item = store.splice(originIndex, 1);
			store.splice(targetIndex, 0, item);
			broadcast();
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
		if (showStats) {
			showStats();
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
