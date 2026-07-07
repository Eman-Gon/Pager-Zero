import { useEffect, useState } from 'react';
import { butterbase, syncAccount, type AccountRow } from '../api';

export default function CreditsPanel({ token, tick }: { token: string; tick: number }) {
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    syncAccount(token)
      .then((row) => alive && setAccount(row))
      .catch((err) => alive && setError(String(err)));
    return () => {
      alive = false;
    };
  }, [token, tick]);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      butterbase.setAccessToken(token);
      const plans: any = await butterbase.billing.listPlans();
      const plan = (plans.data ?? [])[0];
      if (!plan) throw new Error('no plan configured yet — monetization pending on the platform');
      const checkout: any = await butterbase.billing.subscribe({ planId: plan.id } as any);
      const url = checkout.data?.url ?? checkout.data?.checkout_url;
      if (!url) throw new Error(`no checkout URL: ${JSON.stringify(checkout).slice(0, 200)}`);
      window.open(url, '_blank');
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const credits = account?.apply_credits ?? 0;
  const isDemo = account?.plan === 'demo';
  return (
    <div className="row">
      <span>
        plan <b>{account?.plan ?? 'free'}</b>
      </span>
      <span>
        apply credits <b className={credits > 0 ? 'sev-low' : 'sev-high'}>{credits}</b>
      </span>
      {isDemo && <span className="muted">demo credits (DEMO_AUTO_CREDITS)</span>}
      {credits <= 0 && (
        <button disabled={busy} onClick={subscribe}>
          {busy ? 'Opening checkout…' : 'Subscribe to unlock apply'}
        </button>
      )}
      {error && <span className="err">{error}</span>}
    </div>
  );
}
