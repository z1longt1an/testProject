import { getAccountInformation } from '@spotware-web-team/sdk';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { adapter } from './host.js';
import { TIMEOUT_MS } from './tests.js';

// The trading account the page runs in — its Login and TraderId, so reports from different
// platforms can be matched to the same account. null when the host doesn't say. The host
// replies in PascalCase (Trader.Login), although the SDK's types say camelCase.
export async function getAccount() {
	try {
		const res = await firstValueFrom(
			getAccountInformation(adapter, {}).pipe(timeout(TIMEOUT_MS))
		);
		const trader = res?.payload?.Trader ?? res?.payload?.trader;
		if (!trader) return null;
		return { login: trader.Login ?? trader.login, traderId: trader.TraderId ?? trader.traderId };
	} catch {
		return null;
	}
}
