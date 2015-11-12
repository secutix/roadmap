$(function() {

	var hash = "room_" + window.location.hash.replace(/[\#\.\[\]\$]/g, "");
	var base = new Firebase("https://amber-torch-7267.firebaseio.com/");
	var room = base.child(hash);
	var roadmap = room.child("roadmap");
	var reference = room.child("reference");
	var threshold = room.child("threshold");
	var history = room.child("history");
	var presence = room.child("presence");

	/**
	 *
	 * HELPERS
	 *
	 */
	function format2(int) {
		return int < 10 ? "0" + int : "" + int;
	}

	/**
	 *
	 * FUNCTIONAL
	 *
	 */

	// roadmap
	var store = [];
	var storeReference = [];
	var thresholdValue = 0;

	roadmap.on("value", function(newStoreResp) {
		store = newStoreResp.val() || [];
		renderRoadmap();
	});
	reference.on("value", function(data) {
		storeReference = data.val() || [];
		renderReference();

	});
	threshold.on("value", function(data) {
		thresholdValue = data.val();
		renderRoadmap();
		renderReference();
	});

	function broadcast() {
		roadmap.set(store);
	}
	history.limitToLast(1).on("child_added", function(childSnapshot, prevChildKey) {
		var event = childSnapshot.val();
		if (event.visa != visa) {
			store.forEach(function(text, index) {
				if (text == event.value) {
					$("#roadmap_item_" + index + " .roadmap-author")
						.text(event.visa)
						.removeClass("roadmap-author-new");
					setTimeout(function() {
						$("#roadmap_item_" + index + " .roadmap-author")
							.addClass("roadmap-author-new");
					}, 10);
				}
			});
		}
		$("#user_" + event.visa).removeClass("user-active");
		setTimeout(function() {
			$("#user_" + event.visa).addClass("user-active");
		}, 10);
	});

	// login & presence
	var visa;
	base.onAuth(function(authData) {
		if (authData) {
			var uid = authData.uid;
			console.log("Authenticated user with uid:", uid);
			room.child("users/" + uid).on("value", function(data) {
				visa = data.val();
				$("#main, nav, footer").removeClass("hidden");
				$("#welcome").addClass("hidden");
				$("#visa").text(visa);

				//  online status
				var amOnline = base.child(".info/connected");
				var userRef = room.child("presence/" + visa);
				amOnline.on("value", function(snapshot) {
					if (snapshot.val()) {
						userRef.onDisconnect().remove();
						userRef.set(true);
					}
				});
			});
		} else {
			$("#welcome").removeClass("hidden");
			$("#visa_input").focus();
			$("#main, #stats, nav, footer").addClass("hidden");
			$("#admin_block").addClass("hidden");
		}
	});
	presence.on("value", function(data) {
		if (data) {
			displayOnline(data.val());
		}
	});

	/**
	 *
	 * CHARTING
	 *
	 */
	var chart = c3.generate({
		data: {
			x: "x",
			columns: [
				["x"],
			],
			type: "area-spline"
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
						return format2(date.getHours()) + ":" + format2(date.getMinutes());
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
	var nbPoints = 60;

	// build stats
	history.on("child_added", function(childSnapshot) {
		saved.push(childSnapshot.val());
	});
	// running
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
		if (index == -1) {
			times.push(time);
			times.shift();
			for (var key in users) {
				var userStats = users[key];
				userStats.push(0);
				userStats.shift();

			}
		}

		// reintegrate values
		saved.forEach(function(event) {
			var time = Math.floor(event.time / 10000);
			var visa = event.visa;
			var lastTime = times[times.length - 1];
			var index = times.indexOf(time);
			// save this for later
			if (index == -1 && time > lastTime) {
				remaining.push(event);
				return;
			}
			var userStats = users[visa];
			if (!userStats) {
				userStats = times.map(function() {
					return 0;
				});
				users[visa] = userStats;
			}
			var value = userStats[index];
			userStats[index] = !value ? 1 : value + 1;
		});
		saved = remaining;

		// propagate to chart
		var columns = [
			["x"].concat(times)
		];
		for (var user in users) {
			columns.push([user].concat(users[user]));
		}
		chart.load({
			columns: columns
		});
	}, 500);

	/**
	 *
	 * VIEW
	 *
	 */

	var storeView = [];
	var thresholdMarkup = "<h5>Candidates</h5>";

	function renderRoadmap() {
		var $elementContainer = $("#roadmap_items");
		var newStoreView = [];
		$elementContainer.html("");
		if (store.length) {
			$("#roadmap_items_tips").addClass("hidden");
			store.forEach(function(text, index) {
				if (thresholdValue && index === thresholdValue) {
					$elementContainer.append(thresholdMarkup);
				}
				$elementContainer.append(createElement(text, index, storeView[index] != text, false, index >= thresholdValue));
				newStoreView[index] = text;
			});
		} else {
			$("#roadmap_items_tips").removeClass("hidden");
		}
		// keep a copy for the view
		storeView = newStoreView;
	}

	function renderReference() {
		var $elementContainer = $("#reference_items");
		$elementContainer.html("");
		storeReference.forEach(function(text, index) {
			if (thresholdValue && index === thresholdValue) {
				$elementContainer.append(thresholdMarkup);
			}
			$elementContainer.append(createElement(text, index, true, true, index >= thresholdValue));
		});
	}

	function createElement(text, index, changed, isReference, isCandidate) {
		var $element = $([
			"<p class=\"roadmap-item clearfix " + (isCandidate ? "roadmap-item-candidate" : "") + "\" id=\"roadmap_item_" + index + "\">",
			"<span class=\"roadmap-item-name\"></span>", !isReference && index ? "<a href=\"#\" class=\"roadmap-item-up pull-right\">" : "", !isReference && index ? "<span class=\"glyphicon glyphicon-arrow-up\" aria-hidden=\"true\"></span>" : "", !isReference && index ? "</a>" : "", !isReference ? "<a href=\"#\" class=\"roadmap-item-delete pull-right\">" : "", !isReference ? "<span class=\"glyphicon glyphicon-trash\" aria-hidden=\"true\"></span>" : "", !isReference ? "</a>" : "", !isReference ? "<span class=\"roadmap-author pull-right\"></span>" : "",
			"</p>"
		].join(""));
		$element.data("index", index);
		$element.find(".roadmap-item-name").text(text);
		$element.attr("title", text);
		if (changed) {
			$element.addClass("roadmap-item-new");
		}
		return $element;
	}

	function displayOnline(online) {
		var $online = $("#online");
		$online.html("");
		for (var key in online) {
			if (!online[key]) {
				continue;
			}
			$online.append("<li id=\"user_" + key + "\">" + key + "</li>");
		}
	}

	/**
	 *
	 * DOM HANDLERS
	 *
	 */

	// roadmap handlers
	$("#nav_admin").on("click", function() {
		$("#admin_block").toggleClass("hidden");
		$("#main").toggleClass("admin");
		$("#admin_roadmap_item").focus();
		return false;
	});
	$("#admin_add").on("submit", function() {
		var $item = $("#admin_roadmap_item");
		var value = $item.val();
		if (value) {
			store.push(value);
			$item.val("");
			broadcast();
		}
		return false;
	});
	$("#admin_threshold").on("submit", function() {
		var $item = $("#admin_roadmap_threshold");
		var value = parseInt($item.val(), 10);
		if (!isNaN(value)) {
			threshold.set(value);
			$item.val("");
		}
		return false;
	});
	$("#nav_reference").on("click", function() {
		reference.set(store);
		return false;
	});

	$("#roadmap_items").on("click", ".roadmap-item-up", function() {
		var index = $(this).parent(".roadmap-item").data("index");
		if (index > 0) {
			// swap values
			var value = store[index];
			store[index] = store[index - 1];
			store[index - 1] = value;
			broadcast();
			// also save changed
			if (visa) {
				historyRef = history.push();
				historyRef.set({
					visa: visa,
					index: index,
					value: value,
					time: Firebase.ServerValue.TIMESTAMP
				});
			}
		}
		return false;
	}).on("click", ".roadmap-item-delete", function() {
		var index = $(this).parent(".roadmap-item").data("index");
		store.splice(index, 1);
		broadcast();
		return false;
	});

	// login handlers
	$("#welcome form").on("submit", function(event) {

		event.preventDefault();
		// toggle display
		$(this).hide();
		$("#welcome .progress").removeClass("hidden");
		var visa = $("#visa_input").val();

		base.authAnonymously(function(error, authData) {
			if (error) {
				console.log("Authentication Failed!", error);
				return;
			}
			var uid = authData.uid;
			room.child("users/" + uid).set(visa);
			$("#welcome").hide();
			$("#welcome form").show();
			$("#welcome").addClass("hidden");
			$("#welcome .progress").addClass("hidden");
		});
	});
	$("#nav_logout").on("click", function() {
		base.unauth();
		return false;
	});
	$("#nav_stats").on("click", function() {
		$("#stats, #main").toggleClass("hidden");
		return false;
	});

});
