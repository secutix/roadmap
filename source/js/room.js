/*global Firebase:true*/

import * as helper from './helper';

export default class Room {

	constructor(base, id, visa) {
		let room = base.child(id);

		// db access
		this.roadmap = room.child('roadmap');
		this.reference = room.child('reference');
		this.threshold = room.child('threshold');
		this.history = room.child('history');
		this.presence = room.child('presence');

		// local state
		this.store = [];
		this.storeReference = [];
		this.thresholdValue = 0;

		// stats
		this.savedStats = [];
		this.userStats = {};
		this.itemStats = {};

		//  online status
		var amOnline = base.child('.info/connected');
		var userRef = this.presence.child(visa);
		amOnline.on('value', function(snapshot) {
			if (snapshot.val()) {
				userRef.onDisconnect().remove();
				userRef.set(true);
			}
		});

		this.history.on('child_added', (childSnapshot) => {
			var event = childSnapshot.val();
			var time = event.time;
			var now = Date.now();

			// filter event which are too old (>2h)
			if (now - time > 7200000) {
				return;
			}

			this.savedStats.push(event);

			var eventVisa = event.visa;
			var direction = event.direction;
			var text = event.value;
			var user = helper.getOrSet(this.userStats, eventVisa, {
				up: 0,
				down: 0,
				total: 0,
				toRef: 0,
				againstRef: 0
			});
			var item = helper.getOrSet(this.itemStats, text, {
				up: 0,
				total: 0,
				upUsers: {},
				downUsers: {},
				text: text
			});

			user.total++;
			item.total++;

			if (direction > 0) {
				user.down++;
				helper.getOrSet(item.downUsers, eventVisa, 0);
				item.downUsers[eventVisa]++;
				if (event.index >= event.refIndex) {
					user.againstRef++;
				} else {
					user.toRef++;
				}
			} else {
				item.up++;
				user.up++;
				helper.getOrSet(item.upUsers, eventVisa, 0);
				item.upUsers[eventVisa]++;
				if (event.index <= event.refIndex) {
					user.againstRef++;
				} else {
					user.toRef++;
				}
			}
		});
	}

	broadcast() {
		this.roadmap.set(this.store);
	}

	swap(index, direction, visa) {
		let value = this.store[index];
		this.store[index] = this.store[index + direction];
		this.store[index + direction] = value;
		this.broadcast();
		// also save changed
		if (visa) {
			var refIndex = this.storeReference.indexOf(value);
			var historyRef = this.history.push();
			historyRef.set({
				visa: visa,
				index: index,
				refIndex: refIndex,
				value: value,
				time: Firebase.ServerValue.TIMESTAMP,
				direction: direction
			});
		}
	}

}
