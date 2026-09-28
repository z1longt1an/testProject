<script>
	import sdkPackage from '@spotware-web-team/sdk/package.json';
	import apiPackage from '@spotware-web-team/sdk-external-api/package.json';
	import { registered } from './lib/host.js';
	import { TESTS, TIMEOUT_MS, runTest } from './lib/tests.js';
	import { STATUS_LABELS, buildReport, formatMessage, handshakeText } from './lib/report.js';

	const REGISTER_WAIT_MS = 10000;
	const params = new URLSearchParams(location.search);
	const param = (name) => params.get(name) ?? '(not passed)';

	const environment = [
		['Page', location.origin + location.pathname],
		['platform', param('platform')],
		['placement', param('placement')],
		['lang', param('lang')],
		['theme', param('theme')],
		['@spotware-web-team/sdk', sdkPackage.version],
		['@spotware-web-team/sdk-external-api', apiPackage.version],
		['User agent', navigator.userAgent]
	];

	let handshake = $state({ status: 'waiting', ms: null });
	let results = $state(TESTS.map(() => ({ status: 'pending' })));
	let running = $state(false);
	let symbol = $state(null);
	let startedAt = $state(null);
	let copyNote = $state('');
	let reportElement;

	const report = $derived(buildReport({ environment, handshake, startedAt, symbol, results }));

	const lateTimer = setTimeout(() => {
		if (handshake.status === 'waiting') handshake.status = 'late';
	}, REGISTER_WAIT_MS);

	registered.then(() => {
		clearTimeout(lateTimer);
		handshake = { status: 'registered', ms: Math.round(performance.now()) };
		run();
	});

	async function run() {
		running = true;
		copyNote = '';
		symbol = null;
		startedAt = new Date().toISOString();
		results = TESTS.map(() => ({ status: 'pending' }));
		for (const [i, test] of TESTS.entries()) {
			if (test.id !== 'C1' && !symbol) {
				results[i] = { status: 'skipped', summary: 'No symbol to ask for — C1 gave none.' };
				continue;
			}
			results[i] = { status: 'running' };
			const result = await runTest(test, symbol);
			if (test.id === 'C1') symbol = result.symbol ?? null;
			results[i] = result;
		}
		running = false;
	}

	// the clipboard API can be missing or blocked inside a WebView — fall back to selecting
	// the report and the older copy command
	async function copyReport() {
		try {
			await navigator.clipboard.writeText(report);
			copyNote = 'Copied.';
			return;
		} catch {
			// try the fallback
		}
		window.getSelection().selectAllChildren(reportElement);
		const copied = document.execCommand('copy');
		copyNote = copied ? 'Copied.' : 'Copy failed — the report is selected, copy it by hand.';
	}
</script>

<main>
	<h1>getTrendbarList test</h1>
	<p class="lead">cTrader WebView plugin SDK (<code>@spotware-web-team/sdk</code>)</p>

	<section>
		<h2>What this page tests</h2>
		<p>
			Whether the cTrader host answers <code>getTrendbarList</code>. The page connects with the
			SDK's standard handshake (confirm → register → confirm), then sends the requests below
			one at a time, each with a {TIMEOUT_MS / 1000} s timeout. Two control requests, one
			before and one after, show that the connection works and that the host answers other
			requests.
		</p>
		<ul class="legend">
			<li><span class="badge replied">REPLIED</span> the host sent a reply.</li>
			<li>
				<span class="badge hostError">HOST ERROR</span> the host answered with ERROR_RES (payloadType
				50).
			</li>
			<li>
				<span class="badge noReply">NO REPLY</span> nothing answered the request within
				{TIMEOUT_MS / 1000} s.
			</li>
			<li><span class="badge failed">SDK ERROR</span> the SDK call threw.</li>
		</ul>
		<p>
			<b>Host messages while waiting</b> lists every raw message the host posted to the page while
			a request was waiting, recorded before the SDK matches replies to requests — so a reply
			the SDK couldn't match would still appear there.
		</p>
	</section>

	<section>
		<h2>Environment</h2>
		<dl>
			{#each environment as [label, value]}
				<dt>{label}</dt>
				<dd>{value}</dd>
			{/each}
			<dt>Handshake</dt>
			<dd>{handshakeText(handshake)}</dd>
			<dt>Symbol</dt>
			<dd>{symbol ? `${symbol.name} (id ${symbol.id})` : '-'}</dd>
		</dl>
	</section>

	<section>
		<h2>Requests</h2>
		{#each TESTS as test, i (test.id)}
			{@const result = results[i]}
			<article>
				<header>
					<span class="id">{test.id}</span>
					<code>{test.call}</code>
					<span class="badge {result.status}">{STATUS_LABELS[result.status]}</span>
					{#if result.ms != null}<span class="ms">{result.ms} ms</span>{/if}
				</header>
				<p>{test.about}</p>
				<p class="muted">Expected: {test.expected}</p>
				<pre>{test.call}(adapter, {result.request ? JSON.stringify(result.request) : test.shape})</pre>
				{#if result.summary}
					<p><b>Result:</b> {result.summary}</p>
				{/if}
				{#if result.received}
					<p><b>Host messages while waiting:</b> {result.received.length}</p>
					{#if result.received.length}
						<pre>{result.received.map(formatMessage).join('\n')}</pre>
					{/if}
				{/if}
				{#if result.raw}
					<details>
						<summary>Raw reply</summary>
						<pre>{result.raw}</pre>
					</details>
				{/if}
			</article>
		{/each}
	</section>

	<section>
		<h2>Report</h2>
		<p class="muted">The whole run as plain text, to send on.</p>
		<div class="actions">
			<button type="button" onclick={copyReport}>Copy report</button>
			<button type="button" onclick={run} disabled={running || handshake.status !== 'registered'}>
				Run again
			</button>
			{#if copyNote}<span class="muted">{copyNote}</span>{/if}
		</div>
		<pre class="report" bind:this={reportElement}>{report}</pre>
	</section>
</main>
