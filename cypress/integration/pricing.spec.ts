import { setupClerkTestingToken } from "@clerk/testing/cypress";

describe("Pricing page", () => {
  it("renders Free and Pro plan comparison with the expected copy", () => {
    setupClerkTestingToken();

    cy.visit("/en/pricing");

    cy.contains("Simple, transparent pricing").should("be.visible");
    cy.contains("Up to 20 notes").should("be.visible");
    cy.contains("9€ / month").should("be.visible");
    cy.contains("Unlimited notes").should("be.visible");
    cy.contains("Upgrade to Pro").should("be.visible");
  });
});
