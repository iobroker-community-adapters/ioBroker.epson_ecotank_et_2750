# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

### Adapter-Specific Context

This is the **EPSON EcoTank ET-2750** adapter for ioBroker. Key characteristics:

- **Primary Function**: Monitor ink levels and printer status from EPSON EcoTank series printers
- **Supported Models**: ET-2750 (primary), ET-4750, ET-3750, ET-2721, WF-3620DWF
- **Communication Method**: HTTP requests to printer's web interface (web scraping)
- **Key Dependencies**: axios for HTTP requests, @iobroker/adapter-core for adapter framework
- **Data Sources**: Printer web interface pages (/PRESENTATION/ADVANCED/INFO_MENTINFO/TOP for maintenance info)
- **Configuration**: Printer IP address and polling interval (default 10 minutes)
- **Key Features**: 
  - Ink level monitoring (Cyan, Yellow, Black, Magenta)
  - Printer information (model, firmware, serial, MAC address)
  - Maintenance data (first print date, page count)
  - Connection status monitoring

**Important Implementation Details**:
- Uses regex patterns to parse HTML responses from printer web interface
- Implements percentage calculation based on pixel height values (baselevel = 50px = 100%)
- Handles different printer models with varying response formats
- Includes error handling for network timeouts and connection issues

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();

                        // Start the adapter and wait for it to initialize
                        await harness.startAdapterAndWait();
                        console.log(`Adapter started successfully`);

                        // Allow adapter to run and collect some data
                        await wait(30000); // Wait 30 seconds for initial sync

                        // Verify adapter state
                        const connectionState = await harness.states.getStateAsync(`system.adapter.${adapterName}.0.alive`);
                        expect(connectionState?.val).toBe(true);

                        resolve();
                    } catch (error) {
                        console.error(`Test failed: ${error.message}`);
                        reject(error);
                    }
                });
            });
        });
    }
});
```

#### Configuration Testing
Test various adapter configurations using the harness:

```javascript
suite('Adapter Configuration Tests', (getHarness) => {
    it('should start with valid configuration', async function() {
        const harness = getHarness();
        
        // Set test configuration
        await harness.changeAdapterConfig(adapterName, {
            enabled: true,
            printerip: '192.168.1.100',
            synctime: 5
        });

        await harness.startAdapterAndWait();
        
        // Verify adapter is running
        const aliveState = await harness.states.getStateAsync(`system.adapter.${adapterName}.0.alive`);
        expect(aliveState.val).toBe(true);
    });

    it('should handle invalid IP configuration gracefully', async function() {
        const harness = getHarness();
        
        await harness.changeAdapterConfig(adapterName, {
            enabled: true,
            printerip: 'invalid-ip',
            synctime: 1
        });

        // Adapter should start but show connection issues
        await harness.startAdapterAndWait();
        
        // Check for appropriate error handling
        await wait(5000);
        const connectionState = await harness.states.getStateAsync(`${adapterName}.0.info.connection`);
        expect(connectionState?.val).toBe(false);
    });
});
```

### Testing Best Practices

#### Mocha Configuration
The adapter uses these standard test commands:
- `npm run test:js` - JavaScript unit tests
- `npm run test:package` - Package validation 
- `npm run test:unit` - Unit test suite using @iobroker/testing
- `npm run test:integration` - Integration test suite

Ensure `.mocharc.json` includes proper timeout settings for integration tests:
```json
{
    "require": ["test/mocha.setup.js"],
    "timeout": 30000
}
```

#### Test Data Management
- Create sample HTML responses for different printer models in test fixtures
- Mock axios calls with realistic printer web interface responses
- Test edge cases like network timeouts, invalid responses, and different printer firmware versions

## ioBroker Adapter Development Guidelines

### Adapter Structure and Core Components

#### Adapter Initialization
When creating an ioBroker adapter, use the standard initialization pattern:

```javascript
const utils = require('@iobroker/adapter-core');

function startAdapter(options) {
    return new utils.Adapter(Object.assign(options || {}, {
        name: 'your-adapter-name',
        
        ready: function () {
            // Adapter initialization code
            this.log.info('Adapter started');
        },
        
        unload: function (callback) {
            // Cleanup code
            callback();
        },
        
        stateChange: function (id, state) {
            // Handle state changes
        }
    }));
}
```

#### State Management
Use proper state creation and management:

```javascript
// Create states with proper configuration
await this.setObjectNotExistsAsync('info.connection', {
    type: 'state',
    common: {
        name: 'Connection status',
        type: 'boolean',
        role: 'indicator.connected',
        read: true,
        write: false,
        def: false
    },
    native: {}
});

// Update states with acknowledgment
await this.setStateAsync('info.connection', { val: true, ack: true });

// Subscribe to state changes when needed
this.subscribeStates('*');
```

#### Configuration Handling
Access adapter configuration through the native object:

```javascript
const config = this.config;
const printerIp = config.printerip || '';
const syncTime = parseInt(config.synctime) || 10;
```

#### Logging Best Practices
Use appropriate log levels:

```javascript
this.log.error('Critical error message');   // For errors
this.log.warn('Warning message');           // For warnings  
this.log.info('General information');       // For general info
this.log.debug('Detailed debug info');      // For debugging
```

#### Error Handling
Implement comprehensive error handling:

```javascript
try {
    // Risky operation
    const result = await someAsyncOperation();
} catch (error) {
    this.log.error(`Operation failed: ${error.message}`);
    
    // Update connection state on persistent errors
    await this.setStateAsync('info.connection', { val: false, ack: true });
    
    // Don't crash the adapter - handle gracefully return; } ```

### HTTP Communication Patterns

#### Making HTTP Requests
Use axios consistently for HTTP operations:

```javascript
const axios = require('axios').default;

async function fetchPrinterData(url) {
    try {
        const response = await axios.get(url, {
            timeout: 10000,  // 10 second timeout
            headers: {
                'User-Agent': 'ioBroker-Adapter'
            }
        });
        
        if (response.status === 200) {
            return response.data;
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            throw new Error(`Connection to printer failed: ${error.message}`);
        }
        throw error;
    }
}
```

#### Response Parsing
Use regex patterns carefully for HTML parsing:

```javascript
function parseInkLevel(htmlContent, colorPattern) {
    const regex = new RegExp(colorPattern, 'g');
    const match = regex.exec(htmlContent);
    
    if (match && match[1]) {
        const pixelHeight = parseInt(match[1]);
        // Convert pixel height to percentage (baselevel = 50px = 100%)
        const percentage = Math.round((pixelHeight / 50) * 100);
        return Math.min(percentage, 100); // Cap at 100%
    }
    
    return null; // Return null for missing data
}
```

### Configuration and Admin UI

#### JSON Configuration
Define clear, user-friendly configuration options:

```json
{
    "type": "panel",
    "i18n": true,
    "items": {
        "printerip": {
            "type": "text",
            "label": "Printer IP Address",
            "help": "IP address of the EPSON printer",
            "placeholder": "192.168.1.100"
        },
        "synctime": {
            "type": "number",
            "label": "Poll Interval (minutes)",
            "help": "How often to check printer status",
            "min": 1,
            "max": 1440,
            "default": 10
        }
    }
}
```

#### Input Validation
Always validate configuration inputs:

```javascript
function validateConfig(config) {
    const errors = [];
    
    if (!config.printerip || !config.printerip.trim()) {
        errors.push('Printer IP address is required');
    }
    
    const syncTime = parseInt(config.synctime);
    if (isNaN(syncTime) || syncTime < 1 || syncTime > 1440) {
        errors.push('Poll interval must be between 1 and 1440 minutes');
    }
    
    return errors;
}
```

### Data Processing and State Updates

#### Batch State Updates
When updating multiple states, use efficient patterns:

```javascript
async function updatePrinterStates(printerData) {
    const stateUpdates = [];
    
    // Prepare all state updates
    if (printerData.connection !== undefined) {
        stateUpdates.push(['info.connection', printerData.connection]);
    }
    
    if (printerData.inkLevels) {
        Object.entries(printerData.inkLevels).forEach(([color, level]) => {
            stateUpdates.push([`inks.${color}`, level]);
        });
    }
    
    // Execute all updates
    for (const [id, value] of stateUpdates) {
        await this.setStateAsync(id, { val: value, ack: true });
    }
}
```

#### Data Type Consistency
Ensure consistent data types for states:

```javascript
// Numbers should be actual numbers, not strings
const pageCount = parseInt(match[1]) || 0;
await this.setStateAsync('info.page_count', { val: pageCount, ack: true });

// Booleans should be actual booleans
const isConnected = response.status === 200;
await this.setStateAsync('info.connection', { val: isConnected, ack: true });

// Strings should be cleaned and validated
const modelName = (match[1] || '').trim();
await this.setStateAsync('info.model', { val: modelName, ack: true });
```

### Scheduling and Timers

#### Implementing Polling
Use proper timer management for periodic tasks:

```javascript
let pollTimer = null;

function startPolling(intervalMinutes) {
    stopPolling(); // Clear any existing timer
    
    const intervalMs = intervalMinutes * 60 * 1000;
    
    // Immediate first poll
    pollPrinterData();
    
    // Set up recurring poll
    pollTimer = setInterval(() => {
        pollPrinterData();
    }, intervalMs);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

// Always stop polling in unload
unload: function(callback) {
    stopPolling();
    callback();
}
```

### Localization and Internationalization

#### Multi-language Support
Implement proper i18n for user-facing strings:

```javascript
// In admin/words.js
{
    "Printer IP Address": {
        "en": "Printer IP Address",
        "de": "Drucker IP-Adresse",
        "ru": "IP-адрес принтера",
        "pt": "Endereço IP da impressora",
        "nl": "Printer IP-adres",
        "fr": "Adresse IP de l'imprimante",
        "it": "Indirizzo IP della stampante",
        "es": "Dirección IP de la impresora"
    }
}
```

### Security Considerations

#### Input Sanitization
Always sanitize inputs, especially for network operations:

```javascript
function sanitizeIP(ip) {
    if (typeof ip !== 'string') return '';
    
    // Basic IP validation
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    return ipRegex.test(ip.trim()) ? ip.trim() : '';
}
```

#### Safe Regular Expressions
Avoid regex denial of service:

```javascript
// Use specific, bounded patterns
const safePattern = /^[a-zA-Z0-9\-\.]{1,50}$/;

// Set timeouts for regex operations
function safeRegexMatch(pattern, text, timeoutMs = 1000) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), timeoutMs);
        
        try {
            const result = pattern.exec(text);
            clearTimeout(timer);
            resolve(result);
        } catch (error) {
            clearTimeout(timer);
            resolve(null);
        }
    });
}
```

## Code Style and Standards

### ESLint Configuration
Follow the project's ESLint rules defined in `.eslintrc.json`. Common standards include:
- Use const/let instead of var
- Use template literals for string interpolation
- Implement proper async/await patterns
- Use meaningful variable names
- Add JSDoc comments for public functions

### Code Organization
Structure code logically:
- Keep related functions together
- Use descriptive function names
- Separate concerns (HTTP, parsing, state management)
- Implement proper error boundaries

### Documentation
- Update README.md with configuration examples
- Document any unique printer-specific behaviors
- Include troubleshooting common connection issues
- Provide example configurations for different printer models

## Common Patterns and Code Snippets

### Adapter Ready Function
```javascript
ready: function() {
    this.log.info('Adapter started');
    
    // Validate configuration
    const config = this.config;
    if (!config.printerip) {
        this.log.error('Printer IP address not configured');
        return;
    }
    
    // Set initial connection state
    this.setStateAsync('info.connection', { val: false, ack: true });
    
    // Start main functionality
    this.startPolling();
}
```

### HTTP Request with Retry Logic
```javascript
async function requestWithRetry(url, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios.get(url, { timeout: 10000 });
            return response.data;
        } catch (error) {
            this.log.debug(`Attempt ${attempt} failed: ${error.message}`);
            
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
    }
}
```

### State Object Creation
```javascript
async function createInkStates() {
    const inkColors = ['cyan', 'yellow', 'black', 'magenta'];
    
    for (const color of inkColors) {
        await this.setObjectNotExistsAsync(`inks.${color}`, {
            type: 'state',
            common: {
                name: `${color.charAt(0).toUpperCase() + color.slice(1)} ink level`,
                type: 'number',
                role: 'value',
                unit: '%',
                min: 0,
                max: 100,
                read: true,
                write: false
            },
            native: {}
        });
    }
}
```

Remember to always test thoroughly, handle errors gracefully, and follow ioBroker's development best practices when working on this adapter.