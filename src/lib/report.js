import { TESTS } from './tests.js';

export const STATUS_LABELS = {
	pending: 'WAITING',
	running: 'RUNNING…',
	replied: 'REPLIED',
	hostError: 'HOST ERROR',
	noReply: 'NO REPLY',
	failed: 'SDK ERROR',
	skipped: 'SKIPPED'
};

export function formatMessage(message) {
	const inner = message.innerPayloadType != null ? ` (inner ${message.innerPayloadType})` : '';
	return `+${message.atMs} ms  payloadType ${message.payloadType}${inner}  clientMsgId ${message.clientMsgId ?? '-'}`;
}

export function handshakeText(handshake) {
	if (handshake.status === 'registered') return `Registered ${handshake.ms} ms after page load`;
	if (handshake.status === 'late') return 'Not registered after 10 s (still waiting)';
	return 'Waiting for the host to register the plugin…';
}

// the whole run as plain text, for pasting into an email or ticket
export function buildReport({ environment, handshake, startedAt, symbol, results }) {
	const lines = ['getTrendbarList test — cTrader WebView plugin SDK', ''];
	for (const [label, value] of environment) lines.push(`${label}: ${value}`);
	lines.push(`Handshake: ${handshakeText(handshake)}`);
	lines.push(`Run started: ${startedAt ?? '-'}`);
	lines.push(`Symbol: ${symbol ? `${symbol.name} (id ${symbol.id})` : '-'}`);

	TESTS.forEach((test, i) => {
		const result = results[i];
		lines.push('');
		lines.push(`${test.id} ${test.call} — ${STATUS_LABELS[result.status]}${result.ms != null ? ` in ${result.ms} ms` : ''}`);
		lines.push(`  Request: ${result.request ? JSON.stringify(result.request) : test.shape}`);
		if (result.summary) lines.push(`  Result: ${result.summary}`);
		if (result.received) {
			lines.push(`  Host messages while waiting: ${result.received.length}`);
			for (const message of result.received) lines.push(`    ${formatMessage(message)}`);
		}
		if (result.raw) lines.push(`  Raw reply: ${result.raw}`);
	});
	return lines.join('\n');
}
