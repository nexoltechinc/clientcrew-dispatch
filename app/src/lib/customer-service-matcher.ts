export type CustomerServiceFamily = {
  key: string;
  label: string;
  description: string;
  aliases: string[];
};

export type CustomerServiceMatchResult = {
  normalizedText: string;
  matchedFamilies: CustomerServiceFamily[];
  matchedServiceNames: string[];
  needsClarification: boolean;
  clarificationQuestion: string;
};

export const CUSTOMER_SERVICE_FAMILIES: CustomerServiceFamily[] = [
  {
    key: 'ppf',
    label: 'PPF / Paint Protection Film',
    description: 'Protective film coverage for high-wear exterior surfaces.',
    aliases: ['ppf', 'paint protection film', 'clear bra', 'protection film'],
  },
  {
    key: 'ceramic-coating',
    label: 'Ceramic Coating',
    description: 'Surface protection options for paint and gloss retention.',
    aliases: ['ceramic coating', 'ceramic', 'coating'],
  },
  {
    key: 'window-tint',
    label: 'Window Tint',
    description: 'Tinting for comfort, privacy, and UV control.',
    aliases: ['window tint', 'tint', 'film'],
  },
  {
    key: 'paint-correction',
    label: 'Paint Correction',
    description: 'Finish restoration for swirl marks, oxidation, and blemishes.',
    aliases: ['paint correction', 'correction', 'polish'],
  },
  {
    key: 'car-wash',
    label: 'Car Wash',
    description: 'Exterior wash options for quick turnaround and routine care.',
    aliases: ['car wash', 'wash', 'exterior wash'],
  },
  {
    key: 'interior-cleaning',
    label: 'Interior Cleaning',
    description: 'Interior vacuuming, shampooing, and cabin cleanup.',
    aliases: ['interior cleaning', 'interior clean', 'vacuum', 'shampoo'],
  },
  {
    key: 'detailing',
    label: 'Detailing',
    description: 'Inside-and-out refreshes for customer delivery prep.',
    aliases: ['detailing', 'detail', 'interior detailing', 'exterior detailing'],
  },
  {
    key: 'engine-bay',
    label: 'Engine Bay',
    description: 'Engine bay cleaning and presentation prep.',
    aliases: ['engine bay', 'engine', 'engine cleaning'],
  },
  {
    key: 'headlight',
    label: 'Headlight',
    description: 'Headlight restoration and clarity improvements.',
    aliases: ['headlight', 'headlights', 'headlamp'],
  },
  {
    key: 'quick-service',
    label: 'Quick Service',
    description: 'Fast-turn items that can be reviewed quickly by dispatch.',
    aliases: ['quick service', 'quick', 'express', 'fast'],
  },
  {
    key: 'roadside',
    label: 'Roadside',
    description: 'Roadside assistance and urgent response requests.',
    aliases: ['roadside', 'tow', 'assistance', 'breakdown'],
  },
  {
    key: 'remote-starter',
    label: 'Remote Starter',
    description: 'Remote starter installation and related accessories.',
    aliases: ['remote starter', 'starter', 'demarreur', 'demarreurs'],
  },
];

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s/+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreFamilyMatch(text: string, family: CustomerServiceFamily): number {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 0;
  }

  let score = 0;
  const label = normalizeText(family.label);

  if (normalized === label) {
    score += 100;
  }

  if (normalized.includes(label) || label.includes(normalized)) {
    score += 40;
  }

  for (const alias of family.aliases) {
    const token = normalizeText(alias);
    if (!token) {
      continue;
    }
    if (normalized === token) {
      score += 60;
    }
    if (normalized.includes(token)) {
      score += 30;
    }
    if (token.includes(normalized) && normalized.length >= 3) {
      score += 18;
    }
  }

  return score;
}

function scoreServiceName(text: string, name: string, category?: string, description?: string | null): number {
  const normalized = normalizeText(text);
  const candidates = [name, category, description ?? ''];
  let score = 0;

  for (const candidate of candidates) {
    const token = normalizeText(candidate || '');
    if (!token) {
      continue;
    }
    if (normalized === token) {
      score += 120;
    }
    if (normalized.includes(token)) {
      score += 48;
    }
    if (token.includes(normalized) && normalized.length >= 3) {
      score += 24;
    }
  }

  return score;
}

export function normalizeCustomerServiceSelection(
  rawText: string,
  serviceCatalog: Array<{
    name: string;
    category?: string | null;
    description?: string | null;
  }> = [],
): CustomerServiceMatchResult {
  const normalizedText = normalizeText(rawText);
  const familyScores = CUSTOMER_SERVICE_FAMILIES
    .map((family) => ({ family, score: scoreFamilyMatch(rawText, family) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const matchedFamilies = familyScores.slice(0, 3).map((entry) => entry.family);

  const serviceScores = serviceCatalog
    .map((item) => ({
      name: item.name,
      score: scoreServiceName(rawText, item.name, item.category ?? undefined, item.description ?? undefined),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const matchedServiceNames = serviceScores.slice(0, 3).map((entry) => entry.name);
  const needsClarification = matchedFamilies.length === 0 && matchedServiceNames.length === 0;
  const clarificationQuestion = needsClarification
    ? 'Which service family should we start with?'
    : matchedFamilies.length > 1 || matchedServiceNames.length > 1
      ? 'I found a few possible matches. Which one should I use?'
      : 'Thanks. I can use that request.';

  return {
    normalizedText,
    matchedFamilies,
    matchedServiceNames,
    needsClarification,
    clarificationQuestion,
  };
}
