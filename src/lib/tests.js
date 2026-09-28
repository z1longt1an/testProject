import { getLightSymbolList, getSymbol, getTrendbarList } from '@spotware-web-team/sdk';
import { firstValueFrom, TimeoutError } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { adapter, onHostMessage } from './host.js';

export const TIMEOUT_MS = 10000;
const HOUR_MS = 60 * 60 * 1000;
const RAW_LIMIT = 1500;

// ProtoTimeframe values, which IProtoGetTrendbarListReq.period takes
const M5 = 5;
const D1 = 22;

// Sent one at a time, in this order. The two control requests show the connection works and
// the host answers other requests, before and after the trendbar requests.
// `shape` describes the payload for the page; `request(symbol, now)` builds the exact payload
// passed to the SDK call (timestamps are Unix milliseconds).
export const TESTS = [
	{
		id: 'C1',
		call: 'getLightSymbolList',
		about:
			'Control: a request without parameters. Its reply also gives the symbol for the ' +
			'trendbar requests — EURUSD if the account has it, otherwise the first enabled symbol.',
		expected: 'A symbol list.',
		shape: '{}',
		request: () => ({}),
		send: (request) => getLightSymbolList(adapter, request)
	},
	{
		id: 'T1',
		call: 'getTrendbarList',
		about: 'The last 2 M5 bars up to now (period 5 = ProtoTimeframe M5).',
		expected: 'A trendbar list with 2 bars.',
		shape: '{ symbolId, period: 5, toTimestamp: now, count: 2 }',
		request: (symbol, now) => ({ symbolId: symbol.id, period: M5, toTimestamp: now, count: 2 }),
		send: (request) => getTrendbarList(adapter, request)
	},
	{
		id: 'T2',
		call: 'getTrendbarList',
		about: 'The last 2 D1 bars up to now (period 22 = ProtoTimeframe D1).',
		expected: 'A trendbar list with 2 bars.',
		shape: '{ symbolId, period: 22, toTimestamp: now, count: 2 }',
		request: (symbol, now) => ({ symbolId: symbol.id, period: D1, toTimestamp: now, count: 2 }),
		send: (request) => getTrendbarList(adapter, request)
	},
	{
		id: 'T3',
		call: 'getTrendbarList',
		about: 'Every M5 bar in the last hour, asked for by time range instead of count.',
		expected: 'A trendbar list with about 12 bars (fewer while the market is closed).',
		shape: '{ symbolId, period: 5, fromTimestamp: now - 1 hour, toTimestamp: now }',
		request: (symbol, now) => ({
			symbolId: symbol.id,
			period: M5,
			fromTimestamp: now - HOUR_MS,
			toTimestamp: now
		}),
		send: (request) => getTrendbarList(adapter, request)
	},
	{
		id: 'C2',
		call: 'getSymbol',
		about:
			'Control: a request with a parameter, sent after the trendbar requests — shows the ' +
			'host is still answering.',
		expected: "The symbol's details.",
		shape: '{ symbolId: [symbolId] }',
		request: (symbol) => ({ symbolId: [symbol.id] }),
		send: (request) => getSymbol(adapter, request)
	}
];

// The host replies in PascalCase (Symbol, Trendbar, Id…), although the SDK's types say
// camelCase — both are read.
const listOf = (payload, name) =>
	payload?.[name] ?? payload?.[name[0].toLowerCase() + name.slice(1)] ?? [];

// EURUSD if listed, otherwise the first enabled symbol
function pickSymbol(payload) {
	const symbols = listOf(payload, 'Symbol')
		.map((symbol) => ({
			id: symbol.Id ?? symbol.symbolId,
			name: symbol.Name ?? symbol.symbolName,
			enabled: symbol.Enabled ?? symbol.enabled
		}))
		.filter((symbol) => symbol.enabled !== false);
	return symbols.find((symbol) => symbol.name === 'EURUSD') ?? symbols[0] ?? null;
}

function summarize(test, payload) {
	if (test.call === 'getLightSymbolList') return `${listOf(payload, 'Symbol').length} symbols`;
	if (test.call === 'getSymbol') return `${listOf(payload, 'Symbol').length} symbol(s)`;
	const bars = listOf(payload, 'Trendbar');
	const last = bars[bars.length - 1];
	const minutes = last?.UtcTimestampInMinutes ?? last?.utcTimestampInMinutes;
	const lastTime = minutes ? `, last bar opens ${new Date(minutes * 60000).toISOString()}` : '';
	return `${bars.length} bar(s)${lastTime}`;
}

function raw(value) {
	const text = JSON.stringify(value) ?? String(value);
	return text.length > RAW_LIMIT ? `${text.slice(0, RAW_LIMIT)}… (truncated)` : text;
}

// Sends one test's request and waits up to TIMEOUT_MS. Returns
// { status, request, ms, summary, raw, received, symbol? }, where status is
// 'replied' | 'hostError' (the host answered with ERROR_RES) | 'noReply' | 'failed',
// and `received` lists every host message that arrived meanwhile.
export async function runTest(test, symbol) {
	const request = test.request(symbol, Date.now());
	const started = performance.now();
	const elapsed = () => Math.round(performance.now() - started);
	const received = [];
	const stopRecording = onHostMessage((message) => received.push({ ...message, atMs: elapsed() }));

	try {
		const res = await firstValueFrom(test.send(request).pipe(timeout(TIMEOUT_MS)));
		const ms = elapsed();
		if (res?.payloadType === 50) {
			const error = res.payload;
			return {
				status: 'hostError',
				request,
				ms,
				summary: `${error?.ErrorCode ?? error?.errorCode}: ${error?.Description ?? error?.description}`,
				raw: raw(res),
				received
			};
		}
		return {
			status: 'replied',
			request,
			ms,
			summary: summarize(test, res?.payload),
			raw: raw(res),
			received,
			symbol: test.id === 'C1' ? pickSymbol(res?.payload) : undefined
		};
	} catch (error) {
		const ms = elapsed();
		if (error instanceof TimeoutError) {
			return {
				status: 'noReply',
				request,
				ms,
				summary: `No reply within ${TIMEOUT_MS / 1000} s`,
				raw: null,
				received
			};
		}
		return { status: 'failed', request, ms, summary: String(error), raw: null, received };
	} finally {
		stopRecording();
	}
}
