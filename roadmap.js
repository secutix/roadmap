$(function() {

	// DEV - PROD switch
	var baseDomain = window.location.host.indexOf("localhost") != -1 ? "roadmap2" : "amber-torch-7267";

	var base = new Firebase("https://" + baseDomain + ".firebaseio.com/");
	var roadmap = base.child("roadmap");
	var reference = base.child("reference");
	var threshold = base.child("threshold");
	var history = base.child("history");
	var presence = base.child("presence");

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
				$("#main, nav, footer").removeClass("hidden");
				$("#welcome").addClass("hidden");
				$("#visa").text(visa);

				//  online status
				var amOnline = base.child(".info/connected");
				var userRef = base.child("presence/" + visa);
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
			$("#main, nav, footer").addClass("hidden");
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
				historyRef = history.push();
				historyRef.set({
					visa: visa,
					index: index,
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
			var index = $(this).parent(".roadmap-item").data("index");
			store.splice(index, 1);
			broadcast();
			return false;
		})
		.on("dragstart", ".roadmap-item", function(event) {
			event = event.originalEvent;
			$item = $(this);
			$item.addClass("roadmap-item-dragging");
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setData("application/json", JSON.stringify({
				index: $item.data("index"),
				item: $item.find(".roadmap-item-name").text()
			}));
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
			setTimeout(function() {
				$this.removeClass("roadmap-item-drop-target-enter");
			}, 100);
		})
		.on("dragend", ".roadmap-item", function() {
			$(this).removeClass("roadmap-item-dragging");
			$("#roadmap_items .roadmap-item").removeClass("roadmap-item-drop-target")
				.removeClass("roadmap-item-drop-target-enter");
		})
		.on("drapdrop drop", ".roadmap-item", function(event) {
			event = event.originalEvent;
			var targetIndex = $(this).data("index");
			var originIndex = JSON.parse(event.dataTransfer.getData("application/json")).index;
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
			$("#welcome form").show();
			$("#welcome").addClass("hidden");
			$("#welcome .progress").addClass("hidden");
		});
	});
	$("#nav_logout").on("click", function() {
		base.unauth();
		return false;
	});
	$("#nav_toggle").on("click", function() {
		$("nav .navbar-right").toggleClass("hidden-xs");
	});

});
