const fs = require('fs');
const path = require('path');

const testFile = path.resolve(__dirname, '../../Myavana-Chatbot/packages/core/src/__tests__/agentTools.test.js');
console.log('Target test file:', testFile);

if (!fs.existsSync(testFile)) {
  console.error('Error: agentTools.test.js not found!');
  process.exit(1);
}

let code = fs.readFileSync(testFile, 'utf8');

// We want to replace the weather test block with the mockCapturedHandlers version
const oldWeatherTest = `describe('getWeatherForecast tool (TASK_MSDK_005)', () => {
    it('executes cleanly and calculates frizz index correctly based on relative humidity', async () => {
        const { globalTools } = require('../agentTools');
        const getWeatherForecast = globalTools.find(t => t.name === 'getWeatherForecast');
        
        expect(getWeatherForecast).toBeDefined();

        const originalFetch = global.fetch;

        try {
            // Mock Open-Meteo success payload with HIGH humidity
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    current: {
                        temperature_2m: 28,
                        relative_humidity_2m: 85,
                        weather_code: 3
                    }
                })
            });

            const resultHigh = await getWeatherForecast.execute({ location: 'Atlanta' });
            expect(resultHigh.location).toContain('Atlanta, GA');
            expect(resultHigh.temperature).toBe('28°C');
            expect(resultHigh.humidity).toBe('85%');
            expect(resultHigh.frizzIndex).toBe('HIGH');
            expect(resultHigh.advisory).toContain('Curls are highly prone to swelling');

            // Mock Open-Meteo success payload with LOW humidity
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    current: {
                        temperature_2m: 15,
                        relative_humidity_2m: 20,
                        weather_code: 1
                    }
                })
            });

            const resultLow = await getWeatherForecast.execute({ location: 'Chicago' });
            expect(resultLow.location).toContain('Chicago, IL');
            expect(resultLow.temperature).toBe('15°C');
            expect(resultLow.humidity).toBe('20%');
            expect(resultLow.frizzIndex).toBe('LOW (DRY AIR)');
            expect(resultLow.advisory).toContain('Moisture will evaporate rapidly');

        } finally {
            global.fetch = originalFetch;
        }
    });
});`;

const newWeatherTest = `describe('getWeatherForecast tool (TASK_MSDK_005)', () => {
    it('executes cleanly and calculates frizz index correctly based on relative humidity', async () => {
        const handler = mockCapturedHandlers['getWeatherForecast'];
        expect(handler).toBeDefined();

        const originalFetch = global.fetch;

        try {
            // Mock Open-Meteo success payload with HIGH humidity
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    current: {
                        temperature_2m: 28,
                        relative_humidity_2m: 85,
                        weather_code: 3
                    }
                })
            });

            const resultHigh = await handler({ location: 'Atlanta' });
            expect(resultHigh.location).toContain('Atlanta, GA');
            expect(resultHigh.temperature).toBe('28°C');
            expect(resultHigh.humidity).toBe('85%');
            expect(resultHigh.frizzIndex).toBe('HIGH');
            expect(resultHigh.advisory).toContain('Curls are highly prone to swelling');

            // Mock Open-Meteo success payload with LOW humidity
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    current: {
                        temperature_2m: 15,
                        relative_humidity_2m: 20,
                        weather_code: 1
                    }
                })
            });

            const resultLow = await handler({ location: 'Chicago' });
            expect(resultLow.location).toContain('Chicago, IL');
            expect(resultLow.temperature).toBe('15°C');
            expect(resultLow.humidity).toBe('20%');
            expect(resultLow.frizzIndex).toBe('LOW (DRY AIR)');
            expect(resultLow.advisory).toContain('Moisture will evaporate rapidly');

        } finally {
            global.fetch = originalFetch;
        }
    });
});`;

code = code.replace(oldWeatherTest, newWeatherTest);

fs.writeFileSync(testFile, code, 'utf8');
console.log('Successfully updated getWeatherForecast Jest unit tests using mockCapturedHandlers!');
