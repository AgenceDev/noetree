import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockSessionsCreate = vi.fn();
const mockConvexQuery = vi.fn();
const mockAuth = vi.fn();
const mockRedirectNav = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function StripeMock() {
    return {
      checkout: { sessions: { create: mockSessionsCreate } },
    };
  }),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(function ConvexHttpClientMock() {
    return {
      query: mockConvexQuery,
    };
  }),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirectNav,
  // next-intl's createNavigation (used by "@/i18n/routing") destructures both
  // `redirect` and `permanentRedirect` from "next/navigation" at module-load
  // time, even though only `redirect` is ever invoked by this action.
  permanentRedirect: vi.fn(),
}));

let createCheckoutSession: (locale: string) => Promise<void>;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_PRO_PRICE_ID = "price_test_123";
  process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
  process.env.APP_URL = "https://localhost:3000";

  ({ createCheckoutSession } = await import("./actions"));
});

describe("createCheckoutSession", () => {
  beforeEach(() => {
    mockSessionsCreate.mockReset();
    mockConvexQuery.mockReset();
    mockAuth.mockReset();
    mockRedirectNav.mockClear();
  });

  it("signed-out visitor is redirected to sign-in, and never calls Stripe (D-02)", async () => {
    const mockRedirectToSignIn = vi.fn();
    mockAuth.mockResolvedValue({
      userId: null,
      redirectToSignIn: mockRedirectToSignIn,
    });

    await createCheckoutSession("en");

    expect(mockRedirectToSignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        returnBackUrl: expect.stringContaining("/en/pricing"),
      }),
    );
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("already-active subscription short-circuits straight to the success page, no Stripe call (D-08)", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_active_1",
      redirectToSignIn: vi.fn(),
    });
    mockConvexQuery.mockResolvedValue({
      status: "active",
      stripeCustomerId: "cus_active_1",
    });

    await expect(createCheckoutSession("en")).rejects.toThrow(/REDIRECT:/);

    expect(mockRedirectNav).toHaveBeenCalledWith(
      expect.stringContaining("/en/checkout/success"),
    );
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("no/inactive subscription creates a Checkout Session with correct metadata + conditional customer reuse (D-06/D-07)", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_new_1",
      redirectToSignIn: vi.fn(),
    });
    mockSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_1",
    });

    // No existing subscription row: no `customer` param should be set (Stripe creates a new customer).
    mockConvexQuery.mockResolvedValueOnce(null);
    await expect(createCheckoutSession("en")).rejects.toThrow(/REDIRECT:/);
    expect(mockSessionsCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mode: "subscription",
        line_items: [expect.objectContaining({ price: "price_test_123" })],
        metadata: expect.objectContaining({ clerkUserId: "user_new_1" }),
        subscription_data: expect.objectContaining({
          metadata: expect.objectContaining({ clerkUserId: "user_new_1" }),
        }),
      }),
    );
    expect(mockSessionsCreate.mock.calls[0][0]).not.toHaveProperty("customer");

    // Existing inactive row: stripeCustomerId reused (D-06), same metadata contract (D-07).
    mockConvexQuery.mockResolvedValueOnce({
      status: "canceled",
      stripeCustomerId: "cus_existing_1",
    });
    await expect(createCheckoutSession("en")).rejects.toThrow(/REDIRECT:/);
    expect(mockSessionsCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        customer: "cus_existing_1",
        metadata: expect.objectContaining({ clerkUserId: "user_new_1" }),
        subscription_data: expect.objectContaining({
          metadata: expect.objectContaining({ clerkUserId: "user_new_1" }),
        }),
      }),
    );
  });
});
