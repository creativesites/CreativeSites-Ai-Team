const fs = require('fs');
const path = require('path');

const toolsFile = path.resolve(__dirname, '../../Myavana-Chatbot/packages/core/src/agentTools.js');
console.log('Target tools file:', toolsFile);

if (!fs.existsSync(toolsFile)) {
  console.error('Error: agentTools.js not found!');
  process.exit(1);
}

let code = fs.readFileSync(toolsFile, 'utf8');

// Define getWeatherForecast tool
const weatherToolCode = `/**
 * Real Weather-Aware Hair Concierge tool (TASK_MSDK_005)
 * Pulls live meteorological data from Open-Meteo API
 * and maps relative humidity and temperature directly to personalized hair care advice.
 */
const getWeatherForecast = ai.defineTool(
    {
        name: 'getWeatherForecast',
        description:
            'Fetch real, live local weather, humidity, and temperature data to compute a personalized hair health frizz-index advisory. ' +
            'Call this when the user asks: "What is the hair weather forecast?", "How is the humidity today?", "Show my frizz outlook", ' +
            'or when advising on styling matching current ambient conditions. ' +
            'Supports querying by city name or defaulting to Atlanta, GA (MYAVANA HQ) or Chicago, IL.',
        inputSchema: z.object({
            location: z.string().optional().describe(
                'The city name or zip code to query (e.g. "Atlanta", "Chicago", "Los Angeles", "New York"). ' +
                'Defaults to Atlanta, GA.'
            ),
        }),
        outputSchema: z.object({
            location: z.string(),
            temperature: z.string(),
            humidity: z.string(),
            frizzIndex: z.string(),
            advisory: z.string(),
            conditions: z.string(),
        }).passthrough(),
    },
    async ({ location = 'Atlanta' }) => {
        const coords = {
            'atlanta': { lat: 33.7490, lon: -84.3880, display: 'Atlanta, GA' },
            'chicago': { lat: 41.8781, lon: -87.6298, display: 'Chicago, IL' },
            'new york': { lat: 40.7128, lon: -74.0060, display: 'New York, NY' },
            'los angeles': { lat: 34.0522, lon: -118.2437, display: 'Los Angeles, CA' },
            'houston': { lat: 29.7604, lon: -95.3698, display: 'Houston, TX' },
        };

        const locKey = String(location).toLowerCase().trim();
        const coord = coords[locKey] || coords['atlanta'];
        const displayLoc = coords[locKey] ? coords[locKey].display : \`\${location} (defaulted to Atlanta, GA)\`;

        try {
            const res = await fetch(
                \`https://api.open-meteo.com/v1/forecast?latitude=\${coord.lat}&longitude=\${coord.lon}&current=temperature_2m,relative_humidity_2m,weather_code\`
            );
            if (!res.ok) throw new Error('Weather service unavailable');
            const data = await res.json();
            
            const temp = Math.round(data.current?.temperature_2m || 72);
            const humidity = Math.round(data.current?.relative_humidity_2m || 50);
            const weatherCode = data.current?.weather_code || 0;

            let conditions = 'Clear Sky';
            if (weatherCode >= 1 && weatherCode <= 3) conditions = 'Partly Cloudy';
            else if (weatherCode >= 51 && weatherCode <= 67) conditions = 'Drizzle/Rain';
            else if (weatherCode >= 71 && weatherCode <= 82) conditions = 'Snowfall';
            else if (weatherCode >= 95) conditions = 'Thunderstorm';

            let frizzIndex = 'MODERATE';
            let advisory = 'Moderate humidity. Your curl pattern is stable. Maintain standard leave-in and standard sealant oil.';
            
            if (humidity > 65) {
                frizzIndex = 'HIGH';
                advisory = 'High ambient humidity detected. Curls are highly prone to swelling and frizz. Apply anti-humectant sealers, utilize a silicone-alternative serum, and consider protective styles.';
            } else if (humidity < 35) {
                frizzIndex = 'LOW (DRY AIR)';
                advisory = 'Dry, low-humidity air detected. Moisture will evaporate rapidly from your hair shaft. Focus heavily on humectants, leave-in conditioner, and deep-steaming hydration routines.';
            }

            return {
                location: displayLoc,
                temperature: \`\${temp}°C\`,
                humidity: \`\${humidity}%\`,
                frizzIndex,
                advisory,
                conditions,
            };
        } catch (err) {
            console.error('getWeatherForecast tool error:', err.message);
            return {
                location: \`\${location} (Fallback)\`,
                temperature: '72°F',
                humidity: '50%',
                frizzIndex: 'MODERATE',
                advisory: 'Meteorological feed temporarily offline. Standard styling regimen recommended: focus on moisture retention and protect ends.',
                conditions: 'Offline',
            };
        }
    }
);`;

// Inject tool before globalTools array
code = code.replace(
  'const globalTools = [searchServices, lookupFAQ];',
  `${weatherToolCode}\n\nconst globalTools = [searchServices, lookupFAQ, getWeatherForecast];`
);

fs.writeFileSync(toolsFile, code, 'utf8');
console.log('Successfully patched agentTools.js with getWeatherForecast tool!');
