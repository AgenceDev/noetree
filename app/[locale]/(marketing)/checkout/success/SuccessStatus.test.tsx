// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUseQuery = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("@convex-dev/react-query", () => ({
  convexQuery: vi.fn((fn: unknown, args: unknown) => ({ fn, args })),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { subscriptions: { getSubscription: "subscriptions.getSubscription" } },
}));

import { SuccessStatus } from "./SuccessStatus";

describe("SuccessStatus", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading copy while the Convex query has not resolved (D-10)", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: true });

    render(<SuccessStatus clerkUserId="user_1" />);

    expect(
      screen.getByText(/Confirming your subscription/),
    ).toBeInTheDocument();
  });

  it('shows "Subscription active" once the row is active (D-09)', () => {
    mockUseQuery.mockReturnValue({
      data: { status: "active" },
      isPending: false,
    });

    render(<SuccessStatus clerkUserId="user_1" />);

    expect(screen.getByText(/Subscription active/)).toBeInTheDocument();
  });

  it('swaps to timeout copy + a "Refresh status" control after the timeout window when status is not active (D-11)', () => {
    mockUseQuery.mockReturnValue({ data: null, isPending: false });

    render(<SuccessStatus clerkUserId="user_1" />);

    vi.advanceTimersByTime(20000);

    expect(screen.getByText(/Still confirming/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Refresh status/i }),
    ).toBeInTheDocument();
  });
});
