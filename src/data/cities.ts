import type { CityDefinition } from '@/types/game';
import { TIER_RESTAURANTS } from './restaurants';

interface CitySeed {
  name: string;
  region: string;
  tagline: string;
  sky: string;
  ground: string;
  accent: string;
  eateryCount: 2 | 3; // total 6 or 7 businesses per city
}

/**
 * 60 Original Global Culinary Cities forming a repeating infinite prestige cycle.
 * Each city sequences 6–7 increasingly complex businesses:
 * Mini Kiosk (1 stn) -> Street Stall (2 stn) -> Food Van (3 stn) -> 2–3 Eateries (4–7 stn) -> Grand Flagship (10 stn).
 */
const CITY_SEEDS: CitySeed[] = [
  { name: 'Solaria Bay', region: 'Pacific Coast', tagline: 'Sun-drenched boardwalk flavors', sky: '#7ec8e3', ground: '#c7d9b7', accent: '#ff7b54', eateryCount: 3 },
  { name: 'Harbor Heights', region: 'East Seaboard', tagline: 'Bustling skyline street carts', sky: '#8ecae6', ground: '#bcc5ce', accent: '#fb8500', eateryCount: 2 },
  { name: 'Coral Reef Key', region: 'Sunbelt Coast', tagline: 'Pastel shores & neon nights', sky: '#72efdd', ground: '#e8dab2', accent: '#ff5d8f', eateryCount: 3 },
  { name: 'Lumière Quarter', region: 'Western Europe', tagline: 'Cobblestone cafés & gilded patisseries', sky: '#a2d2ff', ground: '#d5cbb8', accent: '#e07a9a', eateryCount: 3 },
  { name: 'Thamesford Market', region: 'Northern Isles', tagline: 'Lantern markets & crisp coastal fare', sky: '#94a3b8', ground: '#bfc7c0', accent: '#0077b6', eateryCount: 3 },
  { name: 'Koi District', region: 'East Asia', tagline: 'Cherry blossoms & midnight ramen', sky: '#ffc8dd', ground: '#cad2c5', accent: '#e63946', eateryCount: 3 },
  { name: 'Amalfi Lagoon', region: 'Mediterranean', tagline: 'Terracotta canals & woodfire ovens', sky: '#89c2d9', ground: '#e2cfb6', accent: '#d62828', eateryCount: 3 },
  { name: 'Cedar Port', region: 'Levantine Coast', tagline: 'Fragrant spice souks by the sea', sky: '#f4d58d', ground: '#dec8a4', accent: '#c8553d', eateryCount: 3 },
  { name: 'Linden Plaza', region: 'Central Europe', tagline: 'Courtyard grills & artisan bakeries', sky: '#9ec1cf', ground: '#c6ccc4', accent: '#e76f51', eateryCount: 3 },
  { name: 'Fjordhaven', region: 'Nordic Coast', tagline: 'Crisp harbor air & golden pastries', sky: '#8cb3d9', ground: '#c8d5d8', accent: '#2a9d8f', eateryCount: 3 },
  { name: 'Aurelia Forum', region: 'Mediterranean', tagline: 'Marble piazzas & slow-simmered sauces', sky: '#a9d6e5', ground: '#e4d5be', accent: '#e63946', eateryCount: 3 },
  { name: 'Amber Oldtown', region: 'Central Europe', tagline: 'Steaming dumplings & warm hearths', sky: '#a8c6d8', ground: '#d4cfc4', accent: '#d97706', eateryCount: 3 },
  { name: 'Savanna Crown', region: 'Southern Africa', tagline: 'Golden sunsets & open-flame feasts', sky: '#f6bd60', ground: '#d8c39e', accent: '#e76f51', eateryCount: 3 },
  { name: 'Archipelago Pier', region: 'Nordic Isles', tagline: 'Waterfront roasteries & sea grills', sky: '#90c2e7', ground: '#cdd6d5', accent: '#3a86ff', eateryCount: 3 },
  { name: 'Agave Terrace', region: 'Mesoamerica', tagline: 'Vibrant plazas & charcoal cantinas', sky: '#ffb703', ground: '#e6ccb2', accent: '#06d6a0', eateryCount: 3 },
  { name: 'Pinecone Crossing', region: 'Pacific Northwest', tagline: 'Misty food-truck pods & espresso', sky: '#8ecae6', ground: '#a3b18a', accent: '#588157', eateryCount: 2 },
  { name: 'Maple Harbour', region: 'Great Lakes', tagline: 'Lakeside bistros & late-night snacks', sky: '#98c1d9', ground: '#c2c8cc', accent: '#e63946', eateryCount: 3 },
  { name: 'Opal Cove', region: 'Oceania', tagline: 'Breezy surfside bowls & grills', sky: '#72efdd', ground: '#e6d8b8', accent: '#00b4d8', eateryCount: 3 },
  { name: 'Velvet Valley', region: 'Western Europe', tagline: 'Gastronomic halls & buttered crusts', sky: '#a8dadc', ground: '#d9d0c1', accent: '#bc4749', eateryCount: 3 },
  { name: 'Highland Firth', region: 'Northern Isles', tagline: 'Stone arcades & hearty pies', sky: '#9db4c0', ground: '#b5c2b7', accent: '#2b9348', eateryCount: 3 },
  { name: 'Jade Lantern City', region: 'East Asia', tagline: 'Imperial woks & steaming bamboo', sky: '#f4a261', ground: '#d8cfc4', accent: '#c1121f', eateryCount: 3 },
  { name: 'Belfry Canals', region: 'Low Countries', tagline: 'Golden waffles & cocoa parlors', sky: '#a2c4d8', ground: '#d4cec3', accent: '#f4a261', eateryCount: 3 },
  { name: 'Bosphorus Crossing', region: 'Eurasia', tagline: 'Two continents of spice & tea', sky: '#8ecae6', ground: '#e2cfa8', accent: '#d90429', eateryCount: 3 },
  { name: 'Elbe Dockyard', region: 'Northern Europe', tagline: 'Red-brick spice warehouses', sky: '#9bb1c4', ground: '#c6c9cc', accent: '#e76f51', eateryCount: 3 },
  { name: 'Alpine Crest', region: 'Alps', tagline: 'Snow-capped views & bubbling fondue', sky: '#a8d8f0', ground: '#d8e2dc', accent: '#d4a373', eateryCount: 3 },
  { name: 'Saffron Arcade', region: 'Northern Italy', tagline: 'High-fashion cafés & risotto bars', sky: '#9ec5e8', ground: '#dfd7cc', accent: '#c9a227', eateryCount: 3 },
  { name: 'Danube Terrace', region: 'Central Europe', tagline: 'Thermal domes & paprika taverns', sky: '#95b8d1', ground: '#d8cbb8', accent: '#e63946', eateryCount: 3 },
  { name: 'Acacia Ridge', region: 'East Africa', tagline: 'Highland coffee & spiced skewers', sky: '#f6bd60', ground: '#d6c198', accent: '#2a9d8f', eateryCount: 3 },
  { name: 'Aurora Harbor', region: 'Baltic North', tagline: 'Nordic harbor markets & rye loaves', sky: '#84b6f4', ground: '#cad5db', accent: '#3a86ff', eateryCount: 3 },
  { name: 'Verde Metropolis', region: 'South America', tagline: 'Sky-high steakhouses & tropical cafés', sky: '#74c69d', ground: '#d9cbb4', accent: '#ffb703', eateryCount: 3 },
  { name: 'Emerald Sound', region: 'Pacific Northwest', tagline: 'Roast houses & harbor crab stalls', sky: '#8ab1c7', ground: '#a9b8a3', accent: '#0096c7', eateryCount: 3 },
  { name: 'Cabrillo Cliffs', region: 'Southern Coast', tagline: 'Fish tacos & sunset patios', sky: '#72d6ef', ground: '#e8d5b5', accent: '#ff6b35', eateryCount: 2 },
  { name: 'Pierlight Pier', region: 'Pacific Coast', tagline: 'Ferris wheel cones & boardwalk fries', sky: '#80ed99', ground: '#e9dbb8', accent: '#ff006e', eateryCount: 3 },
  { name: 'Grand Square', region: 'Low Countries', tagline: 'Crisp frites & gilded chocolate shops', sky: '#a4c2d8', ground: '#d6cfc4', accent: '#d97706', eateryCount: 3 },
  { name: 'Citadel Valley', region: 'Western Europe', tagline: 'Fortress bridges & fine dining', sky: '#9cb8cc', ground: '#c7d1c5', accent: '#2d6a4f', eateryCount: 3 },
  { name: 'Neon Victoria', region: 'East Asia', tagline: 'Dim sum towers & harbor glow', sky: '#a2d2ff', ground: '#c4cad0', accent: '#f15bb5', eateryCount: 3 },
  { name: 'Prosecco Hills', region: 'Mediterranean', tagline: 'Tiramisu origins & stone trattorias', sky: '#98cbe8', ground: '#dfd4be', accent: '#e07a9a', eateryCount: 3 },
  { name: 'Ochre Medina', region: 'North Africa', tagline: 'Tagine courtyards & mint tea', sky: '#f4a261', ground: '#e2c299', accent: '#c8553d', eateryCount: 3 },
  { name: 'Rhine Promenade', region: 'Central Europe', tagline: 'Cathedral squares & pretzel halls', sky: '#99bdd4', ground: '#c8cdc7', accent: '#d97706', eateryCount: 3 },
  { name: 'Baltic Spire', region: 'Northern Europe', tagline: 'Medieval walls & spiced pastries', sky: '#8fb4cf', ground: '#ced5d8', accent: '#3a86ff', eateryCount: 3 },
  { name: 'Renaissance Terrace', region: 'Mediterranean', tagline: 'Gelato artisans & Tuscan grills', sky: '#9ed2ea', ground: '#e6d7be', accent: '#bc4749', eateryCount: 3 },
  { name: 'Starlight Bridge', region: 'Central Europe', tagline: 'Chimney cakes & lantern cellars', sky: '#96b7d4', ground: '#d4ccc2', accent: '#e76f51', eateryCount: 3 },
  { name: 'Tabletop Bay', region: 'Southern Africa', tagline: 'Ocean cliffs & spiced coastal platters', sky: '#7ec8e3', ground: '#d7c8a8', accent: '#06d6a0', eateryCount: 3 },
  { name: 'Mermaid Canal', region: 'Nordic Coast', tagline: 'Colorful quays & New Nordic kitchens', sky: '#8ecae6', ground: '#cfd8d7', accent: '#ff6b6b', eateryCount: 3 },
  { name: 'Andean Coast', region: 'South America', tagline: 'Ceviche bars & highland corn', sky: '#89c2d9', ground: '#e0cfb6', accent: '#00b4d8', eateryCount: 3 },
  { name: 'Palm Boulevard', region: 'Pacific Coast', tagline: 'Fusion trucks & rooftop brasseries', sky: '#7dd3fc', ground: '#e8d7b9', accent: '#f43f5e', eateryCount: 2 },
  { name: 'Three-Rivers Foundry', region: 'Appalachia', tagline: 'Stacked sandwiches & iron-bridge diners', sky: '#94a3b8', ground: '#c6cbd0', accent: '#eab308', eateryCount: 3 },
  { name: 'Turquoise Cay', region: 'Caribbean', tagline: 'Island grills & coconut coolers', sky: '#38bdf8', ground: '#efe0be', accent: '#10b981', eateryCount: 3 },
  { name: 'Sol Plaza', region: 'Iberia', tagline: 'Tapas bars & golden churros', sky: '#fbbf24', ground: '#e5d0b3', accent: '#ef4444', eateryCount: 3 },
  { name: 'Tulip Canals', region: 'Low Countries', tagline: 'Houseboat cafés & caramel stroopwafels', sky: '#93c5fd', ground: '#ced6c6', accent: '#f97316', eateryCount: 3 },
  { name: 'Han River Glow', region: 'East Asia', tagline: 'Sizzling BBQ & street market stalls', sky: '#a5b4fc', ground: '#cbd2d9', accent: '#ef4444', eateryCount: 3 },
  { name: 'Canalworks Quarter', region: 'Northern Isles', tagline: 'Spice balti houses & craft bakeries', sky: '#94a3b8', ground: '#c2c8c5', accent: '#f59e0b', eateryCount: 3 },
  { name: 'Nile Lanterns', region: 'North Africa', tagline: 'Golden bazaars & aromatic falafel', sky: '#f59e0b', ground: '#e5cfa6', accent: '#b45309', eateryCount: 3 },
  { name: 'Skyline Main', region: 'Central Europe', tagline: 'Glass towers & cider taverns', sky: '#93c5fd', ground: '#c9cfd4', accent: '#2563eb', eateryCount: 3 },
  { name: 'Château Ramparts', region: 'North America', tagline: 'Maple crêperies & cozy brasseries', sky: '#90c2e7', ground: '#d5dde0', accent: '#dc2626', eateryCount: 3 },
  { name: 'Vesuvio Bay', region: 'Mediterranean', tagline: 'Birthplace of blistered stone pizza', sky: '#7dd3fc', ground: '#e6d3b8', accent: '#dc2626', eateryCount: 3 },
  { name: 'Upper Town Square', region: 'Adriatic', tagline: 'Tiled roofs & open-air coffee culture', sky: '#8ecae6', ground: '#dcd2c0', accent: '#0284c7', eateryCount: 3 },
  { name: 'Jacaranda Avenue', region: 'Southern Africa', tagline: 'Violet blossoms & charcoal grills', sky: '#c4b5fd', ground: '#d8ccb8', accent: '#9333ea', eateryCount: 3 },
  { name: 'Kattegat Quays', region: 'Nordic Coast', tagline: 'Shrimp smörgås & harbor bakeries', sky: '#8bb8d8', ground: '#ccd6da', accent: '#0ea5e9', eateryCount: 3 },
  { name: 'Cordillera Vista', region: 'South America', tagline: 'Mountain-framed markets & grand dining', sky: '#7ec8e3', ground: '#dfd0b8', accent: '#f97316', eateryCount: 3 },
];

export const CITIES: CityDefinition[] = CITY_SEEDS.map((seed, idx) => {
  const mini = TIER_RESTAURANTS.mini_kiosk[idx % TIER_RESTAURANTS.mini_kiosk.length];
  const stall = TIER_RESTAURANTS.street_stall[(idx * 3 + 1) % TIER_RESTAURANTS.street_stall.length];
  const van = TIER_RESTAURANTS.food_van[(idx * 2) % TIER_RESTAURANTS.food_van.length];

  const eateriesPool = TIER_RESTAURANTS.eatery;
  const eateries: string[] = [];
  for (let e = 0; e < seed.eateryCount; e++) {
    const pick = eateriesPool[(idx * 3 + e * 4) % eateriesPool.length];
    if (!eateries.includes(pick)) {
      eateries.push(pick);
    } else {
      eateries.push(eateriesPool[(idx * 3 + e * 4 + 1) % eateriesPool.length]);
    }
  }

  const flagship = TIER_RESTAURANTS.flagship[idx % TIER_RESTAURANTS.flagship.length];

  return {
    index: idx,
    name: seed.name,
    region: seed.region,
    tagline: seed.tagline,
    skyColor: seed.sky,
    groundColor: seed.ground,
    accentColor: seed.accent,
    restaurantIds: [mini, stall, van, ...eateries, flagship],
  };
});

export function getCityByNumber(cityNumber: number): { city: CityDefinition; loop: number } {
  const safeNum = Math.max(1, Math.floor(cityNumber));
  const zeroBased = safeNum - 1;
  const idx = zeroBased % CITIES.length;
  const loop = Math.floor(zeroBased / CITIES.length);
  return { city: CITIES[idx], loop };
}
