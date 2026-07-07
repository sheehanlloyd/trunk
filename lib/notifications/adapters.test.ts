import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit fix (item 2): real notification delivery. These mock the Resend SDK
 * and the Twilio REST call (both real, live-network integrations) so the code
 * paths and error handling are unit-tested without needing live provider
 * credentials — the same approach already used for webhook signature/
 * idempotency testing elsewhere in this codebase.
 */

const state = vi.hoisted(() => ({
  resendSendResult: { data: { id: "email-1" }, error: null as { message: string } | null },
  resendSendCalls: [] as Record<string, unknown>[],
  resendShouldThrow: false,
}));

vi.mock("@/lib/env", () => ({
  notificationFromEmail: () => "AI Receptionist <onboarding@resend.dev>",
  serverEnv: {
    resendApiKey: "test-resend-key",
    twilio: {
      accountSid: "AC_test_sid",
      authToken: "test_auth_token",
      phoneNumber: "+15550009999",
    },
  },
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (payload: Record<string, unknown>) => {
        state.resendSendCalls.push(payload);
        if (state.resendShouldThrow) throw new Error("network down");
        return state.resendSendResult;
      },
    };
  },
}));

beforeEach(() => {
  state.resendSendResult = { data: { id: "email-1" }, error: null };
  state.resendSendCalls = [];
  state.resendShouldThrow = false;
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("dispatchEmail", () => {
  it("sends via Resend and returns true on success", async () => {
    const { dispatchEmail } = await import("./adapters");

    const ok = await dispatchEmail({
      to: "owner@acme.test",
      subject: "New booking",
      body: "Jane wants AC repair tomorrow.",
    });

    expect(ok).toBe(true);
    expect(state.resendSendCalls).toEqual([
      {
        from: "AI Receptionist <onboarding@resend.dev>",
        to: "owner@acme.test",
        subject: "New booking",
        text: "Jane wants AC repair tomorrow.",
      },
    ]);
  });

  it("returns false (never throws) when Resend reports an error", async () => {
    state.resendSendResult = { data: null, error: { message: "invalid_from_address" } } as never;
    const { dispatchEmail } = await import("./adapters");

    const ok = await dispatchEmail({ to: "owner@acme.test", subject: "x", body: "y" });

    expect(ok).toBe(false);
  });

  it("returns false (never throws) when the Resend call itself throws", async () => {
    state.resendShouldThrow = true;
    const { dispatchEmail } = await import("./adapters");

    const ok = await dispatchEmail({ to: "owner@acme.test", subject: "x", body: "y" });

    expect(ok).toBe(false);
  });
});

describe("dispatchSms", () => {
  it("POSTs to the Twilio Messages API with Basic auth and returns true on 2xx", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 201 }));

    const { dispatchSms } = await import("./adapters");
    const ok = await dispatchSms({ to: "+15551234567", body: "New booking!" });

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC_test_sid/Messages.json");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toMatch(/^Basic /);
    const body = new URLSearchParams(init.body as string);
    expect(body.get("From")).toBe("+15550009999");
    expect(body.get("To")).toBe("+15551234567");
    expect(body.get("Body")).toBe("New booking!");
  });

  it("returns false (never throws) on a non-2xx Twilio response", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 400 }));

    const { dispatchSms } = await import("./adapters");
    const ok = await dispatchSms({ to: "+15551234567", body: "New booking!" });

    expect(ok).toBe(false);
  });

  it("returns false (never throws) when fetch itself rejects", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new Error("DNS failure"));

    const { dispatchSms } = await import("./adapters");
    const ok = await dispatchSms({ to: "+15551234567", body: "New booking!" });

    expect(ok).toBe(false);
  });
});
