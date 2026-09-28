import { createClientAdapter } from '@spotware-web-team/sdk-external-api';
import { handleConfirmEvent, registerEvent } from '@spotware-web-team/sdk';
import { createLogger } from '@veksa/logger';
import { take } from 'rxjs/operators';

// The SDK connection, set up the standard way: confirm on load, then confirm again once
// the host registers the plugin. The host registers only once per page load, so this runs
// as soon as the module is imported.
export const adapter = createClientAdapter({ logger: createLogger(false) });

handleConfirmEvent(adapter, {}).pipe(take(1)).subscribe();

export const registered = new Promise((resolve) => {
	registerEvent(adapter)
		.pipe(take(1))
		.subscribe(() => {
			handleConfirmEvent(adapter, {}).pipe(take(1)).subscribe();
			resolve();
		});
});

// Every raw message the host sends, seen before the SDK matches it to a request — so a
// reply the SDK can't match (e.g. a different clientMsgId) would still show up here.
// The SDK accepts host messages both as window 'message' events and as
// 'message-from-host' events, so both are watched.
const listeners = new Set();

function describe(message) {
	let inner;
	try {
		inner = JSON.parse(message?.payload?.data);
	} catch {
		// not a wrapped server reply
	}
	return {
		payloadType: message?.payloadType,
		clientMsgId: message?.clientMsgId,
		innerPayloadType: inner?.payloadType
	};
}

function record(message) {
	const described = describe(message);
	for (const listener of listeners) listener(described);
}

window.addEventListener('message', (event) => {
	if (event.data?.type === 'message-from-host') record(event.data.data);
});
window.addEventListener('message-from-host', (event) => record(event.data));

// calls `listener` with every host message until the returned function is called
export function onHostMessage(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
