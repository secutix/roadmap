$(function() {

	var base = new Firebase("https://amber-torch-7267.firebaseio.com/");
	var roadmap = base.child("roadmap");
	var history = base.child("history");
	var presence = base.child("presence");

	/**
	 *
	 * FUNCTIONAL
	 *
	 */

	// roadmap
	var store = [];
	var storeView = [];
	roadmap.on("value", function(newStoreResp) {
		var newStore = newStoreResp.val();
		var newStoreView = [];
		// update view, naïve way.
		// should reuse elements
		var $elementContainer = $("#roadmap_items");
		var $currentElement;
		$elementContainer.html("");
		if (newStore) {
			$("#roadmap_items_tips").addClass("hidden");
			newStore.forEach(function(text, index) {
				$elementContainer.append(createElement(text, index, newStore.length, storeView[index] != text));
				newStoreView[index] = text;
			});
		} else {
			$("#roadmap_items_tips").removeClass("hidden");
		}
		// save store
		store = newStore ? newStore : [];
		// keep a copy for the view
		storeView = newStoreView;
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
			$("#welcome ").fadeIn();
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

	function createElement(text, index, total, changed) {
		var $element = $([
			"<p class=\"roadmap-item\" id=\"roadmap_item_" + index + "\">",
			"<span class=\"roadmap-item-name\"></span>",
			index ? "<a href=\"#\" class=\"roadmap-item-up pull-right\">" : "",
			index ? "<span class=\"glyphicon glyphicon-arrow-up\" aria-hidden=\"true\"></span>" : "",
			index ? "</a>" : "",
			"<a href=\"#\" class=\"roadmap-item-delete pull-right\">",
			"<span class=\"glyphicon glyphicon-trash\" aria-hidden=\"true\"></span>",
			"</a>",
			"<span class=\"roadmap-author pull-right\"></span>",
			"</p>"
		].join(""));
		$element.data("index", index);
		$element.find(".roadmap-item-name").text(text);
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
