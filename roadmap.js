$(function() {

	var base = new Firebase("https://amber-torch-7267.firebaseio.com/");
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
					value: value
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
			base.child("users/" + uid).set(visa);
			$("#welcome").hide();
			$("#welcome .progress").addClass("hidden");
		});
	});
	$("#nav_logout").on("click", function() {
		base.unauth();
		return false;
	});

});
