import { z } from 'zod';

export const optionsSchema = z.object({
  set_bytes_threshold: z.number(),
  waveform_polling_interval: z.number(),
  playlist_id: z.string(),
  client_id: z.string(),
});
export type Options = z.infer<typeof optionsSchema>;

export const defaultOptions: Options = {
  set_bytes_threshold: 150, // Trial and error
  waveform_polling_interval: 300, // Meh
  playlist_id: '806754918', // Public as I'm too lazy to add authentication
  client_id: 'LF6OAAOD1pPvKtdzJmuQf6Be2yrcvwCp', // Client ID of the SC web client. This changes every so often...
};

export const optionsKeys = Object.keys(defaultOptions);
