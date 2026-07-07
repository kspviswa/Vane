import z from 'zod';
import { Widget } from '../types';
import formatChatHistoryAsString from '@/lib/utils/formatHistory';
import { withRetry } from '@/lib/utils/withRetry';

const schema = z.object({
  location: z
    .string()
    .describe(
      'Human-readable location name (e.g., "New York, NY, USA", "London, UK"). Use this OR lat/lon coordinates, never both. Leave empty string if providing coordinates.',
    ),
  lat: z
    .number()
    .describe(
      'Latitude coordinate in decimal degrees (e.g., 40.7128). Only use when location name is empty.',
    ),
  lon: z
    .number()
    .describe(
      'Longitude coordinate in decimal degrees (e.g., -74.0060). Only use when location name is empty.',
    ),
  notPresent: z
    .boolean()
    .describe('Whether there is no need for the weather widget.'),
});

const systemPrompt = (userProfile?: { name: string; location: string; aboutMe: string }) => `
<role>
You are a location extractor for weather queries. You will receive a user follow up and a conversation history.
Your task is to determine if the user is asking about weather and extract the location they want weather for.
</role>

<instructions>
- If the user is asking about weather, extract the location name OR coordinates (never both).
- If using location name, set lat and lon to 0.
- If using coordinates, set location to empty string.
- If you cannot determine a valid location or the query is not weather-related, set notPresent to true.
- Location should be specific (city, state/region, country) for best results.
- You have to give the location so that it can be used to fetch weather data, it cannot be left empty unless notPresent is true.
- Make sure to infer short forms of location names (e.g., "NYC" -> "New York City", "LA" -> "Los Angeles").
${userProfile?.location ? `- The user's profile says their location is "${userProfile.location}". If the user asks about weather without specifying a location, use this as the default location.` : ''}
</instructions>

<output_format>
You must respond in the following JSON format without any extra text, explanations or filler sentences:
{
  "location": string,
  "lat": number,
  "lon": number,
  "notPresent": boolean
}
</output_format>
`;

const weatherWidget: Widget = {
  type: 'weatherWidget',
  shouldExecute: (classification) =>
    classification.classification.showWeatherWidget,
  execute: async (input) => {
    const output = await withRetry(
      async () =>
        input.llm.generateObject<typeof schema>({
          messages: [
            {
              role: 'system',
              content: systemPrompt(input.userProfile),
            },
            {
              role: 'user',
              content: `<conversation_history>\n${formatChatHistoryAsString(input.chatHistory)}\n</conversation_history>\n<user_follow_up>\n${input.followUp}\n</user_follow_up>`,
            },
          ],
          schema,
        }),
      { timeout: 15000, maxRetries: 3 },
    );

    if (output.notPresent) {
      return;
    }

    const params = output;

    const fetchWithRetry = (url: string, init?: RequestInit) =>
      withRetry(
        async (signal) => {
          const res = await fetch(url, { ...init, signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          return res.json();
        },
        { timeout: 10000, maxRetries: 3 },
      );

    try {
      if (
        params.location === '' &&
        (params.lat === undefined || params.lon === undefined)
      ) {
        throw new Error(
          'Either location name or both latitude and longitude must be provided.',
        );
      }

      if (params.location !== '') {
        const openStreetMapUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(params.location)}&format=json&limit=1`;

        const data = await fetchWithRetry(openStreetMapUrl, {
          headers: {
            'User-Agent': 'Vane',
            'Content-Type': 'application/json',
          },
        });

        const location = data[0];

        if (!location) {
          throw new Error(
            `Could not find coordinates for location: ${params.location}`,
          );
        }

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=auto&forecast_days=7`;

        const weatherData = await fetchWithRetry(weatherUrl, {
          headers: {
            'User-Agent': 'Vane',
            'Content-Type': 'application/json',
          },
        });

        return {
          type: 'weather',
          llmContext: `Weather in ${params.location} is ${JSON.stringify(weatherData.current)}`,
          data: {
            location: params.location,
            latitude: location.lat,
            longitude: location.lon,
            current: weatherData.current,
            hourly: {
              time: weatherData.hourly.time.slice(0, 24),
              temperature_2m: weatherData.hourly.temperature_2m.slice(0, 24),
              precipitation_probability:
                weatherData.hourly.precipitation_probability.slice(0, 24),
              precipitation: weatherData.hourly.precipitation.slice(0, 24),
              weather_code: weatherData.hourly.weather_code.slice(0, 24),
            },
            daily: weatherData.daily,
            timezone: weatherData.timezone,
          },
        };
      } else if (params.lat !== undefined && params.lon !== undefined) {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${params.lat}&longitude=${params.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=auto&forecast_days=7`;
        const reverseGeoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${params.lat}&lon=${params.lon}&format=json`;

        const [weatherData, locationData] = await Promise.all([
          fetchWithRetry(weatherUrl, {
            headers: {
              'User-Agent': 'Vane',
              'Content-Type': 'application/json',
            },
          }),
          fetchWithRetry(reverseGeoUrl, {
            headers: {
              'User-Agent': 'Vane',
              'Content-Type': 'application/json',
            },
          }),
        ]);

        return {
          type: 'weather',
          llmContext: `Weather in ${locationData.display_name} is ${JSON.stringify(weatherData.current)}`,
          data: {
            location: locationData.display_name,
            latitude: params.lat,
            longitude: params.lon,
            current: weatherData.current,
            hourly: {
              time: weatherData.hourly.time.slice(0, 24),
              temperature_2m: weatherData.hourly.temperature_2m.slice(0, 24),
              precipitation_probability:
                weatherData.hourly.precipitation_probability.slice(0, 24),
              precipitation: weatherData.hourly.precipitation.slice(0, 24),
              weather_code: weatherData.hourly.weather_code.slice(0, 24),
            },
            daily: weatherData.daily,
            timezone: weatherData.timezone,
          },
        };
      }

      return {
        type: 'weather',
        llmContext: 'No valid location or coordinates provided.',
        data: null,
      };
    } catch (err) {
      return {
        type: 'weather',
        llmContext: 'Failed to fetch weather data.',
        data: {
          error: `Error fetching weather data: ${err}`,
        },
      };
    }
  },
};
export default weatherWidget;
