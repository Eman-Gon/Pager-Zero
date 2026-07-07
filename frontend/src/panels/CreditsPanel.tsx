import { useEffect, useState } from 'react';
import { butterbase } from '../api';

interface AccountRow {
  user_id: string;
  apply_credits: number;
  plan: string;
}

export default function CreditsPanel({ token, tick }: { token: string; tick: number }) {
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    butterbase.setAccessToken(token);
    butterbase
      .from<AccountRow>('accounts')
      .select('*')
      .then((res: any) => {
        if (!res.error) setAccount(((res.data ?? []) as AccountRow[])[0] ?? null);
      });
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
  return (
    <div className="row">
      <span>
        plan <b>{account?.plan ?? 'free'}</b>
      </span>
      <span>
        apply credits <b className={credits > 0 ? 'sev-low' : 'sev-high'}>{credits}</b>
      </span>
      {credits <= 0 && (
        <button disabled={busy} onClick={subscribe}>
          {busy ? 'Opening checkout…' : 'Subscribe to unlock apply'}
        </button>
      )}
      {error && <span className="err">{error}</span>}
    </div>
  );
}
