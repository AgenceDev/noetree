import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockConstructEvent = vi.fn();
const mockRetrieve = vi.fn();
const mockAction = vi.fn();

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieve },
  })),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(() => ({
    action: mockAction,
  })),
}));

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
  process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
  process.env.INTERNAL_WEBHOOK_SECRET = "shared-secret";

  ({ POST } = await import("./route"));
});

function makeRequest(rawBody: string, signature = "test_sig"): Request {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: rawBody,
    headers: { "stripe-signature": signature },
  });
}

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    mockConstructEvent.mockReset();
    mockRetrieve.mockReset();
    mockAction.mockReset();
  });

  it("returns 400 when the Stripe signature is invalid, and never calls Convex", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(400);
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("returns 200 when the signature is valid and the Convex action resolves", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_1",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1" } },
    });
    mockAction.mockResolvedValue({ ok: true });

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
  });

  it("returns 500 when the Convex action rejects with a generic error (D-11 genuine failure)", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_2",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_2" } },
    });
    mockAction.mockRejectedValue(new Error("Convex unreachable"));

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(500);
  });

  it("returns 400 (not 500) when the Convex action rejects with an Unauthorized-prefixed error (D-02/D-10)", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_3",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_3" } },
    });
    mockAction.mockRejectedValue(
      new Error("Unauthorized: invalid internal webhook secret"),
    );

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(400);
  });

  it("enriches checkout.session.completed with a subscriptionSnapshot via stripe.subscriptions.retrieve", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_4",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_30",
          metadata: { clerkUserId: "user_30" },
        },
      },
    });
    mockRetrieve.mockResolvedValue({
      status: "active",
      items: { data: [{ current_period_end: 12345 }] },
      cancel_at_period_end: false,
    });
    mockAction.mockResolvedValue({ ok: true });

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    expect(mockRetrieve).toHaveBeenCalledWith("sub_30");
    expect(mockAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event: expect.objectContaining({
          data: expect.objectContaining({
            object: expect.objectContaining({
              subscriptionSnapshot: {
                status: "active",
                currentPeriodEnd: 12345,
                cancelAtPeriodEnd: false,
              },
            }),
          }),
        }),
        secret: "shared-secret",
      }),
    );
  });

  it("does not call stripe.subscriptions.retrieve for non-checkout.session.completed events", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_5",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_5", status: "active" } },
    });
    mockAction.mockResolvedValue({ ok: true });

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });
});
