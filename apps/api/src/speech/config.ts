import { z } from 'zod';

// Reviewed public-cloud regional endpoints and GA English voices. No arbitrary URL.
export const speechRegions = [
  'eastus',
  'eastus2',
  'westeurope',
  'northeurope',
  'swedencentral',
  'uksouth',
  'westus',
  'westus2',
  'westus3',
  'southeastasia',
] as const;
export const speechVoices = ['en-US-JennyNeural', 'en-US-BrianNeural'] as const;
export const speechFormats = [
  'audio-24khz-48kbitrate-mono-mp3',
  'audio-16khz-32kbitrate-mono-mp3',
] as const;
export const speechConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    key: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^[\x21-\x7E]+$/u)
      .optional(),
    region: z.enum(speechRegions).optional(),
    voice: z.enum(speechVoices).default('en-US-JennyNeural'),
    format: z.enum(speechFormats).default('audio-24khz-48kbitrate-mono-mp3'),
    // Institutions must review their subscription's output rights before shared caching.
    cacheEnabled: z.boolean().default(false),
  })
  .strict()
  .refine((s) => Boolean(s.key) === Boolean(s.region), {
    message: 'Speech key and region must be configured together',
  });
export type SpeechConfig = z.infer<typeof speechConfigSchema>;
export const speechLocale = 'en-US';
