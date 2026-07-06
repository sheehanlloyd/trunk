"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { PageLayout } from "@/components/shared/PageLayout";
import type { OnboardingDraft } from "@/lib/onboarding/types";
import type { ServiceItem } from "@/lib/types/database";

type Step = "url" | "review" | "done";

interface HourRow {
  day: string;
  hours: string;
}

interface CreateResult {
  businessId: string;
  embedCode: string;
  /** Real provisioned Twilio number (E.164), or null if provisioning didn't run. */
  phoneNumber: string | null;
  phoneNumberPlaceholder: string;
}

/** Editable form state derived from the scraped draft. */
interface EditableDraft {
  name: string;
  ownerEmail: string;
  serviceArea: string;
  services: ServiceItem[];
  hours: HourRow[];
  emergencyPolicy: string;
}

function draftToEditable(draft: OnboardingDraft): EditableDraft {
  return {
    name: draft.name,
    ownerEmail: draft.contact.email ?? "",
    serviceArea: draft.service_area,
    services: draft.services.length > 0 ? draft.services : [{ service: "" }],
    hours: Object.entries(draft.hours).map(([day, hours]) => ({ day, hours })),
    emergencyPolicy: draft.emergency_policy,
  };
}

export function OnboardingClient({ operatorEmail }: { operatorEmail: string }) {
  const [step, setStep] = useState<Step>("url");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [edit, setEdit] = useState<EditableDraft | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [contact, setContact] = useState<OnboardingDraft["contact"]>({});
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);

  async function handleScrape() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong scraping that site.");
        return;
      }
      const draft = data.draft as OnboardingDraft;
      setEdit(draftToEditable(draft));
      setWarnings(draft.warnings ?? []);
      setContact(draft.contact ?? {});
      setSourceUrl(data.sourceUrl ?? url);
      setRawContent(data.rawScrapedContent ?? "");
      setStep("review");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!edit) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding/create-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerEmail: edit.ownerEmail,
          rawScrapedContent: rawContent,
          draft: {
            name: edit.name,
            service_area: edit.serviceArea,
            services: edit.services,
            hours: Object.fromEntries(
              edit.hours
                .filter((h) => h.day.trim() && h.hours.trim())
                .map((h) => [h.day.trim().toLowerCase(), h.hours.trim()]),
            ),
            emergency_policy: edit.emergencyPolicy,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create the business.");
        return;
      }
      setResult(data as CreateResult);
      setStep("done");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("url");
    setUrl("");
    setEdit(null);
    setWarnings([]);
    setContact({});
    setResult(null);
    setError(null);
  }

  return (
    <PageLayout
      title="Onboard a business"
      description={`Signed in as operator ${operatorEmail}. Scrape a prospect's site, review the draft, then create their account.`}
      actions={
        <Button asChild variant="ghost">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      }
    >
      <Steps step={step} />

      {step === "url" && (
        <UrlStep
          url={url}
          setUrl={setUrl}
          loading={loading}
          error={error}
          onScrape={handleScrape}
        />
      )}

      {step === "review" && edit && (
        <ReviewStep
          edit={edit}
          setEdit={setEdit}
          warnings={warnings}
          contact={contact}
          sourceUrl={sourceUrl}
          loading={loading}
          error={error}
          onBack={() => {
            setError(null);
            setStep("url");
          }}
          onCreate={handleCreate}
        />
      )}

      {step === "done" && result && (
        <DoneStep result={result} businessName={edit?.name ?? ""} onReset={reset} />
      )}
    </PageLayout>
  );
}

// --- Step indicator ---------------------------------------------------------
function Steps({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: "url", label: "1. Enter URL" },
    { key: "review", label: "2. Review draft" },
    { key: "done", label: "3. Done" },
  ];
  const activeIndex = items.findIndex((i) => i.key === step);
  return (
    <div className="mb-6 flex gap-2">
      {items.map((item, i) => (
        <span
          key={item.key}
          className={
            "rounded-full px-3 py-1 text-xs font-medium " +
            (i <= activeIndex
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-500")
          }
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

// --- Step 1: URL ------------------------------------------------------------
function UrlStep({
  url,
  setUrl,
  loading,
  error,
  onScrape,
}: {
  url: string;
  setUrl: (v: string) => void;
  loading: boolean;
  error: string | null;
  onScrape: () => void;
}) {
  return (
    <Card className="max-w-2xl p-6">
      <h2 className="text-base font-semibold text-slate-900">
        Prospect website
      </h2>
      <p className="mt-1 text-sm text-[--color-muted]">
        We&apos;ll scrape the visible text and draft their services, hours, and
        service area. Nothing is saved until you confirm.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          value={url}
          placeholder="https://acmeplumbing.com"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim() && !loading) onScrape();
          }}
          className="w-full rounded-lg border border-[--color-border] bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <Button
          onClick={onScrape}
          loading={loading}
          disabled={!url.trim()}
        >
          Scrape site
        </Button>
      </div>
      {error && <ErrorBanner message={error} />}
    </Card>
  );
}

// --- Step 2: Review ---------------------------------------------------------
function ReviewStep({
  edit,
  setEdit,
  warnings,
  contact,
  sourceUrl,
  loading,
  error,
  onBack,
  onCreate,
}: {
  edit: EditableDraft;
  setEdit: (v: EditableDraft) => void;
  warnings: string[];
  contact: OnboardingDraft["contact"];
  sourceUrl: string;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onCreate: () => void;
}) {
  const update = (patch: Partial<EditableDraft>) => setEdit({ ...edit, ...patch });

  const updateService = (i: number, patch: Partial<ServiceItem>) => {
    const services = edit.services.map((s, idx) =>
      idx === i ? { ...s, ...patch } : s,
    );
    update({ services });
  };
  const addService = () =>
    update({ services: [...edit.services, { service: "" }] });
  const removeService = (i: number) =>
    update({ services: edit.services.filter((_, idx) => idx !== i) });

  const updateHour = (i: number, patch: Partial<HourRow>) => {
    const hours = edit.hours.map((h, idx) => (idx === i ? { ...h, ...patch } : h));
    update({ hours });
  };
  const addHour = () => update({ hours: [...edit.hours, { day: "", hours: "" }] });
  const removeHour = (i: number) =>
    update({ hours: edit.hours.filter((_, idx) => idx !== i) });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(edit.ownerEmail.trim());
  const canSubmit = edit.name.trim().length > 0 && emailValid;

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-[--color-muted]">
        Draft from{" "}
        <span className="font-medium text-slate-700">{sourceUrl}</span>. Review
        and correct everything below — this is what the AI will know.
      </p>

      {warnings.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            Needs your attention
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-6">
        <SectionTitle>Business details</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Business name"
            value={edit.name}
            onChange={(v) => update({ name: v })}
            required
          />
          <TextField
            label="Owner email"
            type="email"
            value={edit.ownerEmail}
            onChange={(v) => update({ ownerEmail: v })}
            hint="They'll use this to sign in. Not reliably scraped — confirm it."
            required
            invalid={edit.ownerEmail.length > 0 && !emailValid}
          />
          <TextField
            label="Service area"
            value={edit.serviceArea}
            onChange={(v) => update({ serviceArea: v })}
            className="sm:col-span-2"
          />
        </div>
        {(contact.phone || contact.address) && (
          <p className="mt-3 text-xs text-[--color-muted]">
            Scraped contact info:{" "}
            {[contact.phone, contact.address].filter(Boolean).join(" · ")}
          </p>
        )}
      </Card>

      <Card className="p-6">
        <SectionTitle>Services</SectionTitle>
        <div className="space-y-3">
          {edit.services.map((s, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 rounded-lg border border-[--color-border] p-3 sm:grid-cols-[1fr_1fr_140px_auto]"
            >
              <BareInput
                placeholder="Service"
                value={s.service}
                onChange={(v) => updateService(i, { service: v })}
              />
              <BareInput
                placeholder="Description (optional)"
                value={s.description ?? ""}
                onChange={(v) => updateService(i, { description: v })}
              />
              <BareInput
                placeholder="Price range"
                value={s.price_range ?? ""}
                onChange={(v) => updateService(i, { price_range: v })}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeService(i)}
                aria-label="Remove service"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" className="mt-3" onClick={addService}>
          Add service
        </Button>
      </Card>

      <Card className="p-6">
        <SectionTitle>Hours</SectionTitle>
        <div className="space-y-2">
          {edit.hours.map((h, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_auto] gap-2"
            >
              <BareInput
                placeholder="Day (e.g. monday)"
                value={h.day}
                onChange={(v) => updateHour(i, { day: v })}
              />
              <BareInput
                placeholder="Hours (e.g. 8am–6pm)"
                value={h.hours}
                onChange={(v) => updateHour(i, { hours: v })}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeHour(i)}
                aria-label="Remove hours row"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" className="mt-3" onClick={addHour}>
          Add day
        </Button>
      </Card>

      <Card className="p-6">
        <SectionTitle>Emergency / after-hours policy</SectionTitle>
        <textarea
          value={edit.emergencyPolicy}
          onChange={(e) => update({ emergencyPolicy: e.target.value })}
          rows={3}
          placeholder="e.g. 24/7 emergency line for burst pipes; otherwise take a message."
          className="w-full rounded-lg border border-[--color-border] bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </Card>

      {error && <ErrorBanner message={error} />}

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <Button onClick={onCreate} loading={loading} disabled={!canSubmit}>
          Confirm &amp; create business
        </Button>
      </div>
      {!canSubmit && (
        <p className="text-right text-xs text-[--color-muted]">
          A business name and valid owner email are required.
        </p>
      )}
    </div>
  );
}

// --- Step 3: Done -----------------------------------------------------------
function DoneStep({
  result,
  businessName,
  onReset,
}: {
  result: CreateResult;
  businessName: string;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="max-w-2xl space-y-4">
      <Card className="border-accent-200 bg-accent-50 p-6">
        <h2 className="text-base font-semibold text-accent-700">
          {businessName || "Business"} created
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          The tenant is live in trial status. Share the embed code and invite the
          owner to set their password.
        </p>
      </Card>

      <Card className="p-6">
        <SectionTitle>Embed code</SectionTitle>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
          {result.embedCode}
        </pre>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={async () => {
            await navigator.clipboard.writeText(result.embedCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied!" : "Copy embed code"}
        </Button>
      </Card>

      <Card className="p-6">
        <SectionTitle>Phone number</SectionTitle>
        <p className="text-sm text-slate-700">
          {result.phoneNumber ?? result.phoneNumberPlaceholder}
        </p>
        <p className="mt-1 text-xs text-[--color-muted]">
          {result.phoneNumber
            ? "This Twilio number is live — calls are answered by the AI receptionist."
            : "A Twilio number will be assigned when Twilio is configured."}
        </p>
      </Card>

      <div className="flex gap-2">
        <Button onClick={onReset}>Onboard another</Button>
        <Button asChild variant="secondary">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

// --- Small shared field components ------------------------------------------
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[--color-muted]">
      {children}
    </h3>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  hint,
  required,
  invalid,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  required?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <label className={"block " + (className ?? "")}>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-brand-100 " +
          (invalid
            ? "border-red-400 focus:border-red-400"
            : "border-[--color-border] focus:border-brand-500")
        }
      />
      {hint && <span className="mt-1 block text-xs text-[--color-muted]">{hint}</span>}
    </label>
  );
}

function BareInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-[--color-border] bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
    />
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}
