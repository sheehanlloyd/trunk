"use client";

import { useActionState, useState } from "react";

import { saveBusinessSettings, type ActionResult } from "@/app/dashboard/actions";
import { Button } from "@/components/shared/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/shared/Card";
import { Field, Input, Select } from "@/components/shared/Input";
import { centsToDollarsInput } from "@/lib/dashboard/format";
import type { Business, ServiceItem } from "@/lib/types/database";

const INITIAL: ActionResult = { ok: false };

const DAYS: { key: string; label: string }[] = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

const inputClass =
  "w-full rounded-lg border border-border px-3 py-2 text-sm text-ink-900";

/**
 * The owner's self-service control over what the AI knows (design §6/§11). One
 * form, one Save — everything here is exactly the data the AI reads at
 * conversation time, so editing it is how owners "fix" the AI with no engineer.
 */
export function SettingsForm({ business }: { business: Business }) {
  const [state, formAction, pending] = useActionState(
    saveBusinessSettings,
    INITIAL,
  );
  const [services, setServices] = useState<ServiceItem[]>(
    business.services.length > 0
      ? business.services
      : [{ service: "", description: "", price_range: "" }],
  );

  function updateService(i: number, patch: Partial<ServiceItem>) {
    setServices((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Services JSON travels in a hidden field the action parses/sanitizes. */}
      <input
        type="hidden"
        name="services_json"
        value={JSON.stringify(services)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Business</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-900">
              Business name
            </span>
            <input
              name="name"
              defaultValue={business.name}
              required
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-900">
              Service area
            </span>
            <input
              name="service_area"
              defaultValue={business.service_area ?? ""}
              placeholder="e.g. Austin, TX (25 mi radius)"
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-muted">
              Your AI tells customers outside this area you can&apos;t take the job.
            </span>
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact &amp; alerts</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field
            label="Your mobile number"
            hint="Where booking and emergency texts go."
          >
            <Input
              name="owner_phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              defaultValue={business.owner_phone ?? ""}
              placeholder="e.g. +1 512 555 0134"
            />
          </Field>
          <Field
            label="Review link"
            hint="Your public review page (usually your Google review link). Used when you text happy customers a review request."
          >
            <Input
              name="review_link"
              type="url"
              inputMode="url"
              defaultValue={business.review_link ?? ""}
              placeholder="https://g.page/r/…"
            />
          </Field>
          <Field
            label="How calls reach your AI"
            hint="Forwarding keeps your existing number on trucks and ads — the AI only picks up when you don't."
          >
            <Select
              name="call_routing_mode"
              defaultValue={business.call_routing_mode}
            >
              <option value="direct">
                Customers call the AI number directly
              </option>
              <option value="forward">
                My existing number forwards to the AI after a few rings
              </option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Services &amp; pricing</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-muted">
            These are the services and price ranges your AI quotes. It only ever
            gives ranges you list here — it never invents a price.
          </p>
          {services.map((s, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-border p-3"
            >
              <input
                value={s.service}
                onChange={(e) => updateService(i, { service: e.target.value })}
                placeholder="Service name (e.g. AC Repair)"
                className={inputClass}
              />
              <input
                value={s.description ?? ""}
                onChange={(e) =>
                  updateService(i, { description: e.target.value })
                }
                placeholder="Short description (optional)"
                className={inputClass}
              />
              <div className="flex items-center gap-2">
                <input
                  value={s.price_range ?? ""}
                  onChange={(e) =>
                    updateService(i, { price_range: e.target.value })
                  }
                  placeholder="Price range (e.g. $150–$600)"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() =>
                    setServices((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  aria-label="Remove service"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setServices((prev) => [
                ...prev,
                { service: "", description: "", price_range: "" },
              ])
            }
          >
            + Add a service
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hours</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {DAYS.map((d) => (
            <label key={d.key} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm font-medium text-ink-900">
                {d.label}
              </span>
              <input
                name={`hours_${d.key}`}
                defaultValue={business.hours?.[d.key] ?? ""}
                placeholder="e.g. 8am–6pm, or Closed"
                className={inputClass}
              />
            </label>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emergency policy</CardTitle>
        </CardHeader>
        <CardBody>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">
              How should your AI handle after-hours emergencies?
            </span>
            <textarea
              name="emergency_policy"
              defaultValue={business.emergency_policy ?? ""}
              rows={3}
              placeholder="e.g. No-heat below 40°F is an emergency — text the on-call line for a callback within 15 minutes."
              className={inputClass}
            />
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Average job value</CardTitle>
        </CardHeader>
        <CardBody>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">
              Your typical job value. We use this to estimate the revenue your AI
              captures each week.
            </span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium text-ink-500">$</span>
              <input
                name="average_job_value"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                defaultValue={centsToDollarsInput(
                  business.average_job_value_cents,
                )}
                placeholder="350"
                className={inputClass}
              />
            </div>
          </label>
        </CardBody>
      </Card>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            {state.error ? (
              <span className="text-red-600">{state.error}</span>
            ) : null}
            {state.ok ? (
              <span className="font-medium text-accent-700">Saved.</span>
            ) : null}
          </div>
          <Button type="submit" size="lg" loading={pending}>
            Save changes
          </Button>
        </div>
      </div>
    </form>
  );
}
