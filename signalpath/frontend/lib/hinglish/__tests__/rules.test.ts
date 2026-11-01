import { describe, it, expect } from "vitest";
import { transliterateByRules } from "../rules";

describe("Hinglish Rules Engine Targets (Design.md 2.5)", () => {
  const targets: [string, string][] = [
    ["कमल", "kamal"],
    ["समझ", "samajh"],
    ["सरकार", "sarkar"],
    ["नमस्ते", "namaste"],
    ["चलना", "chalna"],
    ["मित्र", "mitra"],
    ["दोस्त", "dost"],
    ["आप", "aap"],
    ["क्या", "kya"],
    ["ज़िंदगी", "zindagi"],
    ["ज्ञान", "gyan"],
    ["ऋषि", "rishi"],
  ];

  targets.forEach(([hi, exp]) => {
    it(`transliterates '${hi}' -> '${exp}'`, () => {
      const res = transliterateByRules(hi);
      expect(res.text).toBe(exp);
      expect(res.isSuspicious).toBe(false);
    });
  });

  const additionalWords: [string, string][] = [
    ["पानी", "pani"],
    ["घर", "ghar"],
    ["रात", "rat"],
    ["दिन", "din"],
    ["किताब", "kitab"],
    ["गाना", "gana"],
    ["सुंदर", "sundar"],
    ["मंदिर", "mandir"],
    ["भारत", "bharat"],
    ["शहर", "shahar"],
    ["समय", "samay"],
    ["देश", "desh"],
    ["आंख", "aankh"],
    ["फूल", "phul"],
    ["सूरज", "suraj"],
    ["चांद", "chand"],
    ["हवा", "hawa"],
    ["आवाज", "aawaj"],
    ["रोटी", "roti"],
    ["दुकान", "dukan"],
    ["रास्ता", "rasta"],
    ["सपना", "sapna"],
    ["खुशी", "khushi"],
    ["आसमान", "aasman"],
    ["प्यार", "pyar"],
    ["बचपन", "bachpan"],
    ["दोस्ती", "dosti"],
    ["दीवार", "diwar"],
    ["दरवाजा", "darwaja"],
    ["आदमी", "aadmi"],
  ];

  additionalWords.forEach(([hi, exp]) => {
    it(`transliterates '${hi}' -> '${exp}'`, () => {
      const res = transliterateByRules(hi);
      expect(res.text).toBe(exp);
    });
  });

  it("handles edge cases cleanly", () => {
    expect(transliterateByRules("").text).toBe("");
    expect(transliterateByRules("hello").text).toBe("hello");
    expect(transliterateByRules("123").text).toBe("123");
    expect(transliterateByRules("---").text).toBe("");
  });
});
