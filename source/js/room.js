export function getRoom(base, id) {

	let room = base.child(id);
	return {
		roadmap: room.child('roadmap'),
		reference: room.child('reference'),
		threshold: room.child('threshold'),
		history: room.child('history'),
		presence: room.child('presence')
	};
}
