"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, Chrome, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input, Textarea } from "../components/ui/input";
import { api } from "../lib/api";

type Auth = { userId: string; organizationId: string; email: string; csrfToken: string };
type Proposal = {
  proposalId: string;
  policy: { name: string; rules: Array<{ conditions: { domains: string[] } }> };
  schedules: Array<{ timeZone: string; windows: Array<{ days: number[]; start: string; end: string }> }>;
  warnings: string[];
};

export default function Dashboard() {
  const [csrf, setCsrf] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [active, setActive] = useState(false);
  const [enrollmentCode, setEnrollmentCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("focusguard-csrf");
    if (!stored) return;
    setCsrf(stored);
    void api<{ userId: string }>("/v1/auth/me")
      .then(() => setAuthenticated(true))
      .catch(() => sessionStorage.removeItem("focusguard-csrf"));
  }, []);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const signup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(async () => {
      const result = await api<Auth>("/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
          organizationName: "Personal",
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      sessionStorage.setItem("focusguard-csrf", result.csrfToken);
      setCsrf(result.csrfToken);
      setAuthenticated(true);
    });
  };

  const propose = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!csrf) return;
    void run(async () => {
      const result = await api<Proposal>(
        "/v1/policies/proposals",
        {
          method: "POST",
          body: JSON.stringify({
            text: data.get("policy"),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        },
        csrf,
      );
      setProposal(result);
    });
  };

  const confirm = () => {
    if (!csrf || !proposal) return;
    void run(async () => {
      await api(
        "/v1/policies",
        { method: "POST", body: JSON.stringify({ proposalId: proposal.proposalId, confirmation: "CONFIRM" }) },
        csrf,
      );
      setActive(true);
    });
  };

  const enroll = () => {
    if (!csrf) return;
    void run(async () => {
      const result = await api<{ enrollmentCode: string }>(
        "/v1/devices/enrollments",
        { method: "POST", body: JSON.stringify({ name: "My Chrome" }) },
        csrf,
      );
      setEnrollmentCode(result.enrollmentCode);
    });
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-emerald-950/10 bg-white/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-6 w-6 text-moss" /> FocusGuard</div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">Visible · local-first</span>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[190px_1fr]">
        <nav aria-label="Dashboard" className="hidden lg:block">
          {['Dashboard', 'Devices', 'Policies', 'Focus', 'Commitments', 'Accountability', 'Activity', 'Subscription', 'Settings'].map((item, index) => (
            <div key={item} className={`mb-1 rounded-xl px-3 py-2 text-sm ${index === 0 ? 'bg-emerald-100 font-semibold text-emerald-950' : 'text-emerald-950/55'}`}>{item}</div>
          ))}
        </nav>

        <section>
          <div className="mb-8 max-w-2xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-[.14em] text-emerald-700">First policy</p>
            <h1 className="text-4xl font-bold tracking-tight">Protect your work time in under a minute.</h1>
            <p className="mt-3 text-emerald-950/60">Describe your intention. You will review the exact rule before anything is enforced.</p>
          </div>

          {!authenticated ? (
            <Card className="max-w-xl p-6">
              <h2 className="text-xl font-bold">Create your private workspace</h2>
              <form onSubmit={signup} className="mt-5 space-y-4">
                <label className="block text-sm font-semibold">Email<Input name="email" type="email" autoComplete="email" required className="mt-1" /></label>
                <label className="block text-sm font-semibold">Password<Input name="password" type="password" minLength={12} autoComplete="new-password" required className="mt-1" /></label>
                <Button disabled={busy} type="submit">Create account</Button>
              </form>
            </Card>
          ) : (
            <div className="grid gap-5">
              <Card className="p-6">
                <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-violet-100 p-2 text-violet-700"><Sparkles className="h-5 w-5" /></span><div><h2 className="font-bold">Describe your policy</h2><p className="text-sm text-emerald-950/55">Nothing changes until you confirm the preview.</p></div></div>
                <form onSubmit={propose}>
                  <Textarea name="policy" rows={3} defaultValue="Block Reddit during work hours" required />
                  <Button disabled={busy} type="submit" className="mt-3">Preview policy</Button>
                </form>
              </Card>

              {proposal && (
                <Card className="p-6">
                  <div className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-moss" /><h2 className="font-bold">Review the proposed rule</h2></div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-mist p-4"><p className="text-xs font-bold uppercase text-emerald-800">Block</p><p className="mt-1 font-semibold">{proposal.policy.rules[0]?.conditions.domains.join(', ')}</p></div>
                    <div className="rounded-xl bg-mist p-4"><p className="text-xs font-bold uppercase text-emerald-800">Schedule</p><p className="mt-1 font-semibold">{proposal.schedules[0]?.windows.map((window) => `${window.start}–${window.end}`).join(', ')}</p><p className="text-xs text-emerald-950/55">{proposal.schedules[0]?.timeZone}</p></div>
                  </div>
                  {proposal.warnings.map((warning) => <p key={warning} className="mt-3 text-sm text-amber-800">{warning}</p>)}
                  {!active ? <Button disabled={busy} onClick={confirm} className="mt-4">Confirm and activate</Button> : <p className="mt-4 flex items-center gap-2 font-semibold text-emerald-700"><Check className="h-5 w-5" /> Policy active</p>}
                </Card>
              )}

              {active && (
                <Card className="p-6">
                  <div className="flex items-center gap-3"><Chrome className="h-5 w-5 text-moss" /><h2 className="font-bold">Connect Chrome</h2></div>
                  <p className="mt-2 text-sm text-emerald-950/60">Install the unpacked extension, then use this one-time code in its visible popup.</p>
                  {enrollmentCode ? <code className="mt-4 block break-all rounded-xl bg-emerald-950 p-4 text-sm text-emerald-50">{enrollmentCode}</code> : <Button disabled={busy} onClick={enroll} className="mt-3">Create enrollment code</Button>}
                </Card>
              )}
            </div>
          )}
          {error && <p role="alert" className="mt-4 max-w-2xl rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        </section>
      </div>
    </main>
  );
}
