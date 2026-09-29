/**
 * lib/brands.js — Multi-brand configuration, policies, themes, and mock orders
 *
 * Supported brands:
 * 1. "aura" — Aura Skincare (Ayurvedic botanical skincare)
 * 2. "kaveri" — Kaveri Coffee Roasters (Artisanal Chikmagalur specialty coffee)
 */

export const DEFAULT_AURA_POLICIES = {
  brandId: "aura",
  brandName: "Aura Skincare",
  returnWindowDays: 7,
  requiresUnopened: true,
  cancelAllowedStatus: ["Processing"],
  cancelWindowHours: 4,
  damagedReportWindowHours: 48,
  damagedRuleText:
    "Damaged or defective products must be reported within 48 hours of delivery with photos, for a replacement.",
  freeShippingThreshold: 499,
  shippingFee: 50,
  codMaxThreshold: 2500,
  perishableConsumables: false,
  returnNonReturnableReason: null,
};

export const KAVERI_COFFEE_POLICIES = {
  brandId: "kaveri",
  brandName: "Kaveri Coffee Roasters",
  returnWindowDays: 0, // Freshly roasted coffee is a perishable food consumable
  requiresUnopened: true,
  cancelAllowedStatus: ["Processing"], // Only before batch roast & grinding
  cancelWindowHours: 2,
  damagedReportWindowHours: 24,
  damagedRuleText:
    "Damaged coffee bags or wrong grind selections must be reported within 24 hours of delivery with photos for an immediate roast replacement.",
  freeShippingThreshold: 799,
  shippingFee: 80,
  codMaxThreshold: 1500,
  perishableConsumables: true,
  returnNonReturnableReason:
    "Freshly roasted coffee beans are perishable food consumable goods and cannot be returned once delivered for food safety reasons.",
};

export const BRANDS = {
  aura: {
    id: "aura",
    name: "Aura Skincare",
    tagline: "Clean, conscious skincare crafted from Ayurvedic botanicals",
    persona_name: "Aria",
    voice: "Aoede", // Warm, reassuring female voice
    orders_prefix: "ORD-",
    domainCategory: "skincare",
    greeting: "Hi, this is Aria from Aura Skincare. How can I help you today?",
    theme: {
      id: "aura",
      primary: "#f2ca50",
      primaryLight: "#fde047",
      accent: "#e5b838",
      glowColor: "rgba(242, 202, 80, 0.15)",
      font: "var(--font-geist-sans)",
      icon: "✨",
      logoText: "Aura Skincare",
      tagline: "Ayurvedic Botanical Formulations",
      badgeClass: "bg-primary/10 text-primary-light border-primary/20",
    },
    policies: DEFAULT_AURA_POLICIES,
    testOrders: [
      {
        id: "ORD-101",
        customerName: "Priya Sharma",
        product: "Vitamin C Serum (30ml)",
        valueInr: 699,
        status: "Out for Delivery",
        badge: "Out for Delivery",
        notes: "Expected by 6 PM today via BlueDart",
        eta: "Today, 6 PM",
      },
      {
        id: "ORD-102",
        customerName: "Rahul Verma",
        product: "Hydrating Sunscreen SPF 50",
        valueInr: 499,
        status: "Delivered (14d ago)",
        badge: "Policy Decline",
        notes: "Delivered 14 days ago (exceeds 7-day window)",
        deliveredDaysAgo: 14,
      },
      {
        id: "ORD-103",
        customerName: "Ananya Iyer",
        product: "Kumkumadi Night Oil",
        valueInr: 1299,
        status: "Processing",
        badge: "Eligible for Cancel",
        notes: "Placed 2 hours ago (within 4h window)",
        placedHoursAgo: 2,
      },
    ],
  },

  kaveri: {
    id: "kaveri",
    name: "Kaveri Coffee Roasters",
    tagline: "Artisanal shade-grown specialty coffee freshly roasted in Chikmagalur",
    persona_name: "Tara",
    voice: "Puck", // Energetic, crisp, friendly voice
    orders_prefix: "KAV-",
    domainCategory: "specialty coffee",
    greeting: "Hello, this is Tara from Kaveri Coffee Roasters. How can I help with your coffee order today?",
    theme: {
      id: "kaveri",
      primary: "#ea580c", // rich coffee terracotta/amber
      primaryLight: "#fb923c",
      accent: "#c2410c",
      glowColor: "rgba(234, 88, 12, 0.20)",
      font: "var(--font-geist-sans)",
      icon: "☕",
      logoText: "Kaveri Coffee",
      tagline: "Chikmagalur Specialty Roasters",
      badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    },
    policies: KAVERI_COFFEE_POLICIES,
    testOrders: [
      {
        id: "KAV-201",
        customerName: "Siddharth Rao",
        product: "Monsooned Malabar AAA (Whole Bean, 500g)",
        valueInr: 650,
        status: "Out for Delivery",
        badge: "Out for Delivery",
        notes: "Expected by 5 PM today via BlueDart Express",
        eta: "Today, 5 PM",
      },
      {
        id: "KAV-202",
        customerName: "Divya Krishnan",
        product: "Estate Peaberry Dark Roast (French Press Grind, 250g)",
        valueInr: 420,
        status: "Delivered (3d ago)",
        badge: "Perishable Decline",
        notes: "Delivered 3 days ago. Fresh roast non-returnable food consumable",
        deliveredDaysAgo: 3,
      },
      {
        id: "KAV-203",
        customerName: "Arjun Nair",
        product: "Attikan Estate Micro-lot (Aeropress Grind, 500g)",
        valueInr: 840,
        status: "Processing",
        badge: "Eligible for Cancel",
        notes: "Placed 1 hour ago before batch roasting",
        placedHoursAgo: 1,
      },
    ],
  },
};

/**
 * Get brand config by ID, defaulting to Aura Skincare.
 *
 * @param {string} [brandId="aura"]
 * @returns {typeof BRANDS.aura}
 */
export function getBrand(brandId = "aura") {
  if (!brandId || typeof brandId !== "string") return BRANDS.aura;
  const key = brandId.toLowerCase().trim();
  return BRANDS[key] || BRANDS.aura;
}

/**
 * Get all available brand configurations.
 */
export function getAllBrands() {
  return Object.values(BRANDS);
}

/**
 * Get brand policies by brand ID.
 *
 * @param {string} [brandId="aura"]
 */
export function getBrandPolicies(brandId = "aura") {
  const brand = getBrand(brandId);
  return brand.policies;
}

/**
 * Client-side DOM theme switcher: updates CSS custom properties and [data-brand]
 * attribute on <html> with smooth transitions.
 *
 * @param {string} brandId
 */
export function applyBrandTheme(brandId = "aura") {
  if (typeof document === "undefined") return;

  const brand = getBrand(brandId);
  const root = document.documentElement;

  root.setAttribute("data-brand", brand.id);

  if (brand.id === "kaveri") {
    // Warm Chikmagalur coffee palette: rich espresso canvas, copper amber primary
    root.style.setProperty("--color-canvas", "22 15 11"); // #160f0b deep roasted void
    root.style.setProperty("--color-surface-lowest", "14 9 7");
    root.style.setProperty("--color-surface-low", "28 19 14");
    root.style.setProperty("--color-surface", "34 23 17");
    root.style.setProperty("--color-surface-high", "46 32 24");
    root.style.setProperty("--color-surface-highest", "58 41 31");
    root.style.setProperty("--color-primary", "234 88 12"); // #ea580c rich terracotta copper
    root.style.setProperty("--color-primary-light", "251 146 60"); // #fb923c warm caramel
    root.style.setProperty("--color-secondary", "217 119 6"); // #d97706 warm amber
    root.style.setProperty("--color-secondary-light", "245 158 11"); // #f59e0b crema gold
    root.style.setProperty("--glass-border-gold", "rgba(234, 88, 12, 0.25)");
    root.style.setProperty("--glass-border-gold-subtle", "rgba(234, 88, 12, 0.15)");
  } else {
    // Aura Skincare: botanical sanctuary deep forest void + champagne gold
    root.style.setProperty("--color-canvas", "10 22 16"); // #0a1610
    root.style.setProperty("--color-surface-lowest", "5 17 11");
    root.style.setProperty("--color-surface-low", "18 30 24");
    root.style.setProperty("--color-surface", "22 34 28");
    root.style.setProperty("--color-surface-high", "32 45 38");
    root.style.setProperty("--color-surface-highest", "43 56 48");
    root.style.setProperty("--color-primary", "212 175 55"); // #d4af37 champagne gold
    root.style.setProperty("--color-primary-light", "242 202 80"); // #f2ca50
    root.style.setProperty("--color-secondary", "16 185 129"); // #10b981 emerald
    root.style.setProperty("--color-secondary-light", "78 222 163"); // #4edea3
    root.style.setProperty("--glass-border-gold", "rgba(212, 175, 55, 0.20)");
    root.style.setProperty("--glass-border-gold-subtle", "rgba(212, 175, 55, 0.15)");
  }
}
