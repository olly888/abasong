import { describe, expect, it } from "vitest";
import type { OcrLine } from "../imports/extract";
import { extractLabelAddresses } from "./extract";
const row = (
  text: string,
  y: number,
  x = 0.05,
  confidence = 0.99,
): OcrLine => ({
  text,
  x,
  y,
  width: 0.42,
  height: 0.025,
  confidence,
});

describe("recipient address extraction, offline and confirmation-only", () => {
  it("takes To rather than From and excludes name, phone, unit and tracking", () => {
    const results = extractLabelAddresses([
      row("From: TEST Sender", 0.1),
      row("900 Sender Road", 0.14),
      row("Origin, CA 90000", 0.18),
      row("To: TEST Recipient", 0.3),
      row("120 N Example Ave Apt 28, Testville", 0.34),
      row("CA 90000", 0.38),
      row("Phone: 555-555-0100", 0.42),
      row("TEST-TRACK-0123456789", 0.46),
      row("12", 0.5),
    ]);
    expect(results).toEqual([
      {
        street: "120 N Example Ave",
        city: "Testville",
        state: "CA",
        postalCode: "90000",
        searchText: "120 N Example Ave, Testville, CA 90000",
        issues: [],
      },
    ]);
  });
  it("keeps side-by-side sender and recipient blocks separate", () => {
    expect(
      extractLabelAddresses([
        row("From:", 0.1),
        row("To:", 0.1, 0.55),
        row("900 Sender Road", 0.14),
        row("120 Example Ave", 0.14, 0.55),
        row("Origin, CA 90000", 0.18),
        row("Testville, CA 90000", 0.18, 0.55),
      ]).map((r) => r.searchText),
    ).toEqual(["120 Example Ave, Testville, CA 90000"]);
  });
  it("merges split locality and removes a separate unit without making another building", () => {
    const results = extractLabelAddresses([
      row("Ship To: 120 Example Ave", 0.1),
      row("UNIT #28", 0.13),
      row("Testville", 0.16),
      row("CA 90000-1234", 0.19),
    ]);
    expect(results[0]?.searchText).toBe("120 Example Ave, Testville, CA 90000");
  });
  it("deduplicates units at the same base address but retains distinct destinations for choice", () => {
    const results = extractLabelAddresses([
      row("To: 120 Example Ave Apt 1", 0.1),
      row("Testville, CA 90000", 0.14),
      row("To: 120 Example Ave Apt 2", 0.3),
      row("Testville, CA 90000", 0.34),
      row("To: 220 Sample Road", 0.6),
      row("Testville, CA 90000", 0.64),
    ]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.issues.includes("multiple_addresses"))).toBe(
      true,
    );
  });
  it("preserves house numbers and street suffixes without guessing similar characters", () => {
    const results = extractLabelAddresses([
      row("To:", 0.1),
      row("120 1/2 St John St", 0.14),
      row("Testville, CA 90000", 0.18),
      row("To:", 0.5),
      row("12O Example Ave", 0.54),
      row("Testville, CA 90000", 0.58),
    ]);
    // A suffix letter is preserved for confirmation; never silently turn O into 0.
    expect(results.map((r) => r.street)).toEqual([
      "120 1/2 St John St",
      "12O Example Ave",
    ]);
  });
  it("keeps a cropped unlabelled address uncertain and missing locality incomplete", () => {
    const results = extractLabelAddresses([
      row("120 Example Ave", 0.1, 0.05, 0.65),
    ]);
    expect(results[0]).toMatchObject({
      searchText: "120 Example Ave",
      city: null,
      issues: ["recipient_uncertain", "incomplete_address", "check_characters"],
    });
  });
  it("does not fall back to From when To is unreadable or use route, zip, unit or PO box as street", () => {
    expect(
      extractLabelAddresses([
        row("From:", 0.1),
        row("900 Sender Road", 0.14),
        row("Origin, CA 90000", 0.18),
        row("To:", 0.3),
        row("PO BOX 120", 0.34),
        row("CA 90000", 0.38),
        row("C 020", 0.5),
        row("534", 0.6),
        row("Apt 28", 0.7),
        row("TEST123456789", 0.8),
      ]),
    ).toEqual([]);
  });
  it("does not borrow locality from another address or the sender", () => {
    const results = extractLabelAddresses([
      row("To: 120 Example Ave", 0.1),
      row("From:", 0.14),
      row("Origin, CA 90000", 0.18),
    ]);
    expect(results[0]?.issues).toContain("incomplete_address");
    expect(results[0]?.searchText).toBe("120 Example Ave");
  });
  it("ignores invalid geometry and does not expose unrelated OCR text", () => {
    const results = extractLabelAddresses([
      { ...row("To: 120 Example Ave", 0.1), x: NaN },
      row("TEST Person", 0.2),
      row("Phone: 555-555-0100", 0.3),
      row("https://example.com", 0.4),
    ]);
    expect(results).toEqual([]);
  });
});
