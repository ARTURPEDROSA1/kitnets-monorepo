import { describe, expect, it } from "vitest";
import { instagramUrl, linkedinLabel, normalizeInstagram, normalizeLinkedin, telUrl, whatsappUrl } from "./social-links";

describe("normalizeInstagram", () => {
    it("takes a handle, an @handle or a profile URL", () => {
        expect(normalizeInstagram("ana.silva")).toBe("ana.silva");
        expect(normalizeInstagram("@Ana_Silva")).toBe("ana_silva");
        expect(normalizeInstagram("https://www.instagram.com/ana.silva/?hl=pt")).toBe("ana.silva");
        expect(normalizeInstagram("instagram.com/ana.silva")).toBe("ana.silva");
        expect(instagramUrl("ana.silva")).toBe("https://www.instagram.com/ana.silva/");
    });
    it("refuses what is not a handle", () => {
        expect(normalizeInstagram("")).toBeNull();
        expect(normalizeInstagram("  ")).toBeNull();
        expect(normalizeInstagram("ana silva")).toBeNull();
        expect(normalizeInstagram(".ana")).toBeNull();
        expect(normalizeInstagram("a".repeat(31))).toBeNull();
        expect(normalizeInstagram("https://facebook.com/ana")).toBeNull();
    });
});

describe("normalizeLinkedin", () => {
    it("takes a URL in any of its shapes, a path or a bare handle", () => {
        expect(normalizeLinkedin("https://www.linkedin.com/in/ana-silva/")).toBe("https://www.linkedin.com/in/ana-silva/");
        expect(normalizeLinkedin("https://br.linkedin.com/in/ana-silva?trk=x")).toBe("https://www.linkedin.com/in/ana-silva/");
        expect(normalizeLinkedin("linkedin.com/in/ana-silva")).toBe("https://www.linkedin.com/in/ana-silva/");
        expect(normalizeLinkedin("in/ana-silva")).toBe("https://www.linkedin.com/in/ana-silva/");
        expect(normalizeLinkedin("ana-silva")).toBe("https://www.linkedin.com/in/ana-silva/");
        expect(normalizeLinkedin("https://www.linkedin.com/company/kitnets/")).toBe("https://www.linkedin.com/company/kitnets/");
        expect(linkedinLabel("https://www.linkedin.com/in/ana-silva/")).toBe("in/ana-silva");
    });
    it("refuses other sites and junk", () => {
        expect(normalizeLinkedin("")).toBeNull();
        expect(normalizeLinkedin("https://instagram.com/ana")).toBeNull();
        expect(normalizeLinkedin("ana silva")).toBeNull();
        expect(normalizeLinkedin("a")).toBeNull();
    });
});

describe("phone links", () => {
    it("builds WhatsApp and tel links from E.164", () => {
        expect(whatsappUrl("+5531999990000")).toBe("https://wa.me/5531999990000");
        expect(whatsappUrl("+5531999990000", "Olá Ana")).toBe("https://wa.me/5531999990000?text=Ol%C3%A1%20Ana");
        expect(telUrl("+5531999990000")).toBe("tel:+5531999990000");
        expect(whatsappUrl(null)).toBeNull();
        expect(whatsappUrl("+55")).toBeNull();
        expect(telUrl("")).toBeNull();
    });
});
