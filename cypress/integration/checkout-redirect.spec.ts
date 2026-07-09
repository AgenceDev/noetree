import { setupClerkTestingToken } from "@clerk/testing/cypress";

describe("Checkout redirect", () => {
  it("redirects to Stripe's hosted checkout domain when a signed-in user clicks Upgrade to Pro", () => {
    setupClerkTestingToken();

    cy.visit("/en/pricing");

    cy.contains("Upgrade to Pro").click();

    // Does NOT complete a real card payment — only asserts the redirect
    // reaches Stripe's hosted Checkout domain with the session created.
    cy.url({ timeout: 15000 }).should("include", "checkout.stripe.com");
  });
});
