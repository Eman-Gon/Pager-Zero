import { useEffect, useState } from 'react';
import { syncAccount, type AccountRow } from '../api';

export default function CreditsPanel({ token, tick }: { token: string; tick: number }) {
  const [account, setAccount] = useState<AccountRow | null>(null);

  useEffect(() => {
    let alive = true;
    // Demo-ready: silently sync; never surface account/monetization errors.
    syncAccount(token)
      .then((row) => alive && setAccount(row))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token, tick]);

  const plan = account?.plan ?? 'demo';
  // The demo build ships with unlimited apply — no paywall, no rate limits.
  const unlimited = plan !== 'pro' && plan !== 'team';

  return (
    <div className="row">
      <span>
        plan <b>{plan}</b>
      </span>
      <span>
        apply credits <b className="sev-low">{unlimited ? '∞' : account?.apply_credits ?? 0}</b>
      </span>
    </div>
  );
}
