import { describe, expect, it } from "vitest";

import {
  isBookingComplete,
  isUsablePhone,
  missingBookingFields,
} from "./capture";
import type { BookingDetails } from "./types";

const complete: BookingDetails = {
  name: "Jane Doe",
  phone: "(555) 123-4567",
  service: "Water heater repair",
  preferredTime: "Tomorrow morning",
  notes: "",
};

describe("isUsablePhone", () => {
  it("accepts numbers with at least 7 digits, in various formats", () => {
    expect(isUsablePhone("5551234567")).toBe(true);
    expect(isUsablePhone("(555) 123-4567")).toBe(true);
    expect(isUsablePhone("+1 555 123 4567")).toBe(true);
  });

  it("rejects empty, missing, or too-short input", () => {
    expect(isUsablePhone("")).toBe(false);
    expect(isUsablePhone(undefined)).toBe(false);
    expect(isUsablePhone("call me")).toBe(false);
    expect(isUsablePhone("12345")).toBe(false);
  });
});

describe("missingBookingFields", () => {
  it("returns nothing when all required fields are present and valid", () => {
    expect(missingBookingFields(complete)).toEqual([]);
  });

  it("flags each missing required field (notes is not required)", () => {
    expect(missingBookingFields({}).sort()).toEqual(
      ["name", "phone", "preferredTime", "service"].sort(),
    );
    expect(missingBookingFields({ ...complete, notes: "" })).toEqual([]);
  });

  it("treats a present-but-invalid phone as missing", () => {
    expect(missingBookingFields({ ...complete, phone: "call me" })).toEqual([
      "phone",
    ]);
  });

  it("treats whitespace-only values as missing", () => {
    expect(missingBookingFields({ ...complete, name: "   " })).toEqual(["name"]);
  });
});

describe("isBookingComplete", () => {
  it("is true only when nothing required is missing", () => {
    expect(isBookingComplete(complete)).toBe(true);
    expect(isBookingComplete({ ...complete, phone: "" })).toBe(false);
  });
});
