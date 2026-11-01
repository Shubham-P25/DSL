import { describe, it, expect } from "vitest";
import { toHinglish, convertHindiSentence, convertHindiToHinglishText } from "../index";

describe("Hinglish Conversion Pipeline (Design.md 2.4)", () => {
  it("converts Latin tokens as passthrough with high trust", () => {
    const res = toHinglish("YouTube");
    expect(res.hinglish).toBe("YouTube");
    expect(res.tier).toBe("passthrough");
    expect(res.trust).toBe("high");
  });

  it("converts Devanagari tokens via rules or dictionary", () => {
    const res = toHinglish("नमस्ते");
    expect(res.hinglish).toBe("namaste");
    expect(res.trust).not.toBe("low");
  });

  it("converts full sentences", () => {
    const sent = "नमस्ते दोस्त क्या हाल है";
    const converted = convertHindiToHinglishText(sent);
    expect(converted).toContain("namaste");
    expect(converted).toContain("dost");
  });

  it("completes conversion well under 50ms requirement", () => {
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      convertHindiToHinglishText("हम सब मिलकर नया काम करेंगे और आगे बढ़ेंगे");
    }
    const elapsed = performance.now() - t0;
    const perCall = elapsed / 100;
    console.log(`Measured conversion latency per sentence: ${perCall.toFixed(3)} ms`);
    expect(perCall).toBeLessThan(50);
  });
});

