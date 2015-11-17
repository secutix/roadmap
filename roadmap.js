$(function() {

	var hash = "room_" + window.location.hash.replace(/[\#\.\[\]\$]/g, "");
	// DEV - PROD switch
	var baseDomain = window.location.host.indexOf("localhost") != -1 ? "roadmap2" : "amber-torch-7267";

	var base = new Firebase("https://" + baseDomain + ".firebaseio.com/");
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

	// stolen from piskel
	function downloadAsFile(content, filename) {
		var saveAs = window.saveAs || (navigator.msSaveBlob && navigator.msSaveBlob.bind(navigator));
		if (saveAs) {
			saveAs(content, filename);
		} else {
			var downloadLink = document.createElement("a");
			content = window.URL.createObjectURL(content);
			downloadLink.setAttribute("href", content);
			downloadLink.setAttribute("download", filename);
			document.body.appendChild(downloadLink);
			downloadLink.click();
			document.body.removeChild(downloadLink);
		}
	}

	function getOrSet(object, key, defaultValue) {
		var value = object[key];
		if (value) {
			return value;
		}
		object[key] = defaultValue;
		return defaultValue;
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
	var showingStats = false;

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
		store.forEach(function(text, index) {
			if (text == event.value) {
				renderActionNotification(index, event);
			}
		});
		// active user tracking
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
			base.child("users/" + uid).on("value", function(data) {
				visa = data.val();

				// prevent ghost user
				if (!visa) {
					base.unauth();
					return;
				}

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
	var userStats = {};
	var itemStats = {};
	var nbPoints = 60;
	var historyLength = 0;

	history.on("child_added", function(childSnapshot) {
		var event = childSnapshot.val();
		var time = event.time;
		var now = Date.now();

		// filter event which are too old (>2h)
		if (now - time > 720000) {
			return;
		}

		saved.push(event);

		var visa = event.visa;
		var direction = event.direction;
		var text = event.value;
		var user = getOrSet(userStats, visa, {
			up: 0,
			down: 0,
			total: 0,
			toRef: 0,
			againstRef: 0
		});
		var item = getOrSet(itemStats, text, {
			up: 0,
			total: 0,
			upUsers: {},
			downUsers: {}
		});

		user.total++;
		item.total++;

		if (direction > 0) {
			user.down++;
			getOrSet(item.downUsers, visa, 0);
			item.downUsers[visa]++;
			if (event.index >= event.refIndex) {
				user.againstRef++;
			} else {
				user.toRef++;
			}
		} else {
			item.up++;
			user.up++;
			getOrSet(item.upUsers, visa, 0);
			item.upUsers[visa]++;
			if (event.index <= event.refIndex) {
				user.againstRef++;
			} else {
				user.toRef++;
			}
		}

		// show menu link if enough history
		if (historyLength != -1 && historyLength++ > 10) {
			$("#nav_stats").removeClass("hidden");
			historyLength = -1;
		}
	});
	// running
	var statRules = [{
		id: "active",
		fn: function(user) {
			return user.total;
		}
	}, {
		id: "up",
		fn: function(user) {
			return user.up * 100 / user.total;
		}
	}, {
		id: "ref",
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
					visa: "???"
				},
				less: {
					value: null,
					visa: "???"
				}
			};
		});
		// compute results
		var handleRule = function(visa) {
			return function(rule, index) {
				var value = rule.fn(userStats[visa]);
				var stat = stats[index];
				var most = stat.most;
				var less = stat.less;
				if (most.value === null || value >= most.value) {
					most.value = value;
					most.visa = visa;
				}
				if (less.value === null || value < less.value) {
					less.value = value;
					less.visa = visa;
				}
			};
		};
		for (var visa in userStats) {
			statRules.forEach(handleRule(visa));
		}
		// display results
		stats.forEach(function(stat) {
			$("#stats_most_" + stat.id + " .stats-card-visa").text(stat.most.visa);
			$("#stats_less_" + stat.id + " .stats-card-visa").text(stat.less.visa);
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

		// dont process if not showing
		if (!showingStats) {
			return false;
		}

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
		// update stats as well
		showStats();
	}, 2000);

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
		var nbItems = store.length;
		$elementContainer.html("");
		if (nbItems) {
			$("#roadmap_items_tips").addClass("hidden");
			store.forEach(function(text, index) {
				if (thresholdValue && index === thresholdValue) {
					$elementContainer.append(thresholdMarkup);
				}
				$elementContainer.append(createElement(text, index, nbItems, storeView[index] != text, false, index >= thresholdValue));
				newStoreView[index] = text;
			});
			// add last element for DnD
			$elementContainer.append("<div class=\"roadmap-item clearfix\"></div>");
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
			$elementContainer.append(createElement(text, index, null, true, true, index >= thresholdValue));
		});
	}

	function createElement(text, index, total, changed, isReference, isCandidate) {
		var markup = [
			"<div class=\"roadmap-item clearfix " + (isCandidate ? "roadmap-item-candidate" : "") + "\" " +
			(!isReference ? "id=\"roadmap_item_" + index + "\"" : "") + "  draggable=\"true\">",
			"<div>"
		];

		if (!isReference) {
			markup.push("<span class=\"roadmap-item-grab-handle glyphicon glyphicon-move\"></span>");
		}

		markup.push("<span class=\"roadmap-item-name\"></span>");

		if (!isReference) {
			var isNotLast = total && total - 1 != index;
			var isFirst = !index; // formatting issue...
			markup = markup.concat([
				"<span class=\"roadmap-author\"></span>",
				isNotLast ? "<a href=\"#\" class=\"roadmap-item-down\">" : "",
				isNotLast ? "<span class=\"glyphicon glyphicon-arrow-down\" aria-hidden=\"true\"></span>" : "",
				isNotLast ? "</a>" : "",
				index ? "<a href=\"#\" class=\"roadmap-item-up\">" : "",
				index ? "<span class=\"glyphicon glyphicon-arrow-up\" aria-hidden=\"true\"></span>" : "",
				index ? "</a>" : "",
				"<a href=\"#\" class=\"roadmap-item-delete\">",
				"<span class=\"glyphicon glyphicon-trash\" aria-hidden=\"true\"></span>",
				"</a>"
			]);
		}

		markup.push("</div></div>");

		var $element = $(markup.join(""));
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

	function renderActionNotification(index, event) {
		var $item = $("#roadmap_item_" + index + " > div");
		$item.removeClass("roadmap-item-notif-up, roadmap-item-notif-down");
		$(".roadmap-author", $item)
			.text(event.visa)
			.removeClass("roadmap-author-new");
		setTimeout(function() {
			$item.addClass("roadmap-item-notif-" + (event.direction < 0 ? "up" : "down"));
			$(".roadmap-author", $item)
				.addClass("roadmap-author-new");
		}, 10);
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

	// upload / download
	$("#roadmap_items_download").on("click", function() {
		var content = JSON.stringify({
			ref: storeReference,
			store: store,
			threshold: thresholdValue
		});
		downloadAsFile(new Blob([content], {
			type: "application/json"
		}), "roadmap.json");
		return false;
	});
	$("body")
		.on("dragover", function(event) {
			event = event.originalEvent;
			event.dataTransfer.dropEffect = "copy";
			return false;
		})
		.on("drop", function(event) {
			event = event.originalEvent;
			var file = event.dataTransfer.files[0];
			var reader = new FileReader();
			reader.onload = function(event) {
				var data = null;
				try {
					data = JSON.parse(event.target.result);
				} catch (e) {
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
			var index = $(this).parents(".roadmap-item").data("index");
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

	$("#roadmap_items")
		.on("click", ".roadmap-item-up", swap(-1))
		.on("click", ".roadmap-item-down", swap(1))
		.on("click", ".roadmap-item-delete", function() {
			var index = $(this).parents(".roadmap-item").data("index");
			store.splice(index, 1);
			broadcast();
			return false;
		})
		.on("dragstart", ".roadmap-item", function(event) {
			if (!$("#main").hasClass("admin")) {
				return false;
			}
			event = event.originalEvent;
			$item = $(this);
			$item.addClass("roadmap-item-dragging");
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setData("application/json", JSON.stringify({
				index: $item.data("index"),
				item: $item.find(".roadmap-item-name").text()
			}));
			// delay target placeholder display, otherwise stops the drag because
			// of the next element
			setTimeout(function() {
				$("#roadmap_items .roadmap-item:not(.roadmap-item-dragging)").addClass("roadmap-item-drop-target");
			}, 100);
		})
		.on("dragenter", ".roadmap-item", function(event) {
			var $this = $(this);
			if ($this.hasClass("roadmap-item-drop-target")) {
				$(this).addClass("roadmap-item-drop-target-enter");
			}
		})
		.on("dragover", ".roadmap-item", function(event) {
			event = event.originalEvent;
			event.dataTransfer.dropEffect = "move";
			return false;
		})
		.on("dragleave", ".roadmap-item", function(event) {
			event.preventDefault();
			event.stopPropagation();
			var $this = $(this);
			$this.removeClass("roadmap-item-drop-target-enter");

		})
		.on("dragend", ".roadmap-item", function() {
			$(this).removeClass("roadmap-item-dragging");
			$("#roadmap_items .roadmap-item").removeClass("roadmap-item-drop-target")
				.removeClass("roadmap-item-drop-target-enter");
		})
		.on("drop", ".roadmap-item", function(event) {
			event = event.originalEvent;
			var targetIndex = $(this).data("index");
			var originIndex = JSON.parse(event.dataTransfer.getData("application/json")).index;
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
			base.child("users/" + uid).set(visa);
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

	$("#nav_stats, #stats h2 .close").on("click", function() {
		$("#stats, #main").toggleClass("hidden");
		showingStats = !showingStats;
		if (showStats) {
			showStats();
			if ($("#main").hasClass("admin")) {
				$("#nav_admin").trigger("click");
			}
		}
		return false;
	});
	$("#nav_toggle").on("click", function() {
		$("nav .navbar-right").toggleClass("hidden-xs");
	});

});
