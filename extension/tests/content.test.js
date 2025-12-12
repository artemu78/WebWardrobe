/**
 * @jest-environment jsdom
 */
// Replace jest-chrome with manual mock to ensure full control over mocks
global.chrome = {
    runtime: {
        onMessage: {
            addListener: jest.fn(),
        },
        sendMessage: jest.fn(),
    },
};

// Mock Sentry
global.Sentry = {
    init: jest.fn(),
};

describe('content.js', () => {
    let originalWindow;
    let originalDocument;

    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = '';

        // Setup initial window state
        originalWindow = { ...global.window };
        delete global.window.webWardrobeContentScriptInjected;

        // Reset mocks
        jest.resetAllMocks();
        jest.resetModules();

        // Mock unawaited fetch in SHOW_TOPUP_PROMPT
        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve('https://mock-payment-url.com')
        }));

        // Mock window.open
        global.window.open = jest.fn();
        // Mock window.getComputedStyle
        global.window.getComputedStyle = jest.fn((element) => ({
            position: 'static',
            display: 'inline',
            top: '0px',
            left: '0px',
            right: '0px',
            bottom: '0px',
            zIndex: 'auto',
            marginTop: '0px',
            marginBottom: '0px',
            marginLeft: '0px',
            marginRight: '0px',
        }));
    });

    afterEach(() => {
        // Restore window properties
        if (originalWindow) {
            // Restore specific properties we might have messed with
            // Note: completely replacing global.window in JSDOM environment 
            // is tricky/discouraged, better to restore properties.
            delete global.window.webWardrobeContentScriptInjected;
        }
    });

    const loadContentScript = () => {
        // We mock Sentry global presence for the script
        // Note: Jest JSDOM doesn't support Sentry by default so we rely on the global mock above
        jest.isolateModules(() => {
            require('../content.js');
        });
    };

    test('should initialize Sentry if available', () => {
        loadContentScript();
        expect(Sentry.init).toHaveBeenCalled();
    });

    test('should register onMessage listener if not injected', () => {
        loadContentScript();
        expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
        expect(global.window.webWardrobeContentScriptInjected).toBe(true);
    });

    test('should not register listener if already injected', () => {
        global.window.webWardrobeContentScriptInjected = true;
        loadContentScript();
        expect(chrome.runtime.onMessage.addListener).not.toHaveBeenCalled();
    });

    describe('Message Handling', () => {
        let messageHandler;
        const testUrl = 'http://example.com/image.jpg';
        let img;

        beforeEach(() => {
            loadContentScript();
            // Get the registered listener
            // jest-chrome stores listeners. chrome.runtime.onMessage.addListener.calls[0][0]
            messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

            // Setup DOM with an image
            img = document.createElement('img');
            img.src = testUrl;
            document.body.appendChild(img);
        });

        test('SHOW_PROCESSING: should wrap image and show overlay', () => {
            messageHandler({
                action: 'SHOW_PROCESSING',
                originalUrl: testUrl
            }, {}, jest.fn());

            const wrapper = document.querySelector('[data-webwardrobe-wrapper="true"]');
            expect(wrapper).toBeTruthy();
            expect(wrapper.contains(img)).toBe(true);

            const overlay = wrapper.querySelector(`[id="webwardrobe-overlay-${testUrl}"]`);
            expect(overlay).toBeTruthy();
            expect(overlay.textContent).toBe('Processing Try-On...');
        });

        test('SHOW_PROCESSING: should handle absolute positioning', () => {
            global.window.getComputedStyle.mockReturnValue({
                position: 'absolute',
                top: '10px',
                left: '20px',
                zIndex: '5',
                display: 'block'
            });

            messageHandler({
                action: 'SHOW_PROCESSING',
                originalUrl: testUrl
            }, {}, jest.fn());

            const wrapper = document.querySelector('[data-webwardrobe-wrapper="true"]');
            expect(wrapper.style.position).toBe('absolute');
            expect(wrapper.style.top).toBe('10px');
            expect(wrapper.style.left).toBe('20px');
            expect(wrapper.style.zIndex).toBe('5');

            expect(img.style.position).toBe('static');
        });

        test('SHOW_PROCESSING: should match encoded URLs', () => {
            const decodedUrl = 'http://example.com/hashed image.jpg';
            const encodedUrl = 'http://example.com/hashed%20image.jpg';

            img.src = encodedUrl; // Image has encoded src, is a valid URL

            messageHandler({
                action: 'SHOW_PROCESSING',
                originalUrl: decodedUrl // Request sends decoded url
            }, {}, jest.fn());

            const wrapper = document.querySelector('[data-webwardrobe-wrapper="true"]');
            expect(wrapper).toBeTruthy();
        });

        test('SHOW_PROCESSING: should not double wrap', () => {
            // Call twice
            messageHandler({ action: 'SHOW_PROCESSING', originalUrl: testUrl }, {}, jest.fn());
            messageHandler({ action: 'SHOW_PROCESSING', originalUrl: testUrl }, {}, jest.fn());

            const wrappers = document.querySelectorAll('[data-webwardrobe-wrapper="true"]');
            expect(wrappers.length).toBe(1);

            const overlays = document.querySelectorAll(`[id="webwardrobe-overlay-${testUrl}"]`);
            expect(overlays.length).toBe(1);
        });

        test('REPLACE_IMAGE: should remove overlay and update src', () => {
            // First setup overlay
            messageHandler({ action: 'SHOW_PROCESSING', originalUrl: testUrl }, {}, jest.fn());

            const resultUrl = 'http://example.com/result.jpg';
            messageHandler({
                action: 'REPLACE_IMAGE',
                originalUrl: testUrl,
                resultUrl: resultUrl
            }, {}, jest.fn());

            const overlay = document.querySelector(`[id="webwardrobe-overlay-${testUrl}"]`);
            expect(overlay).toBeNull();
            expect(img.src).toBe(resultUrl);
            expect(img.style.opacity).toBe('0.5'); // check transition start
        });

        test('SHOW_ERROR: should update existing overlay', () => {
            // Setup overlay
            messageHandler({ action: 'SHOW_PROCESSING', originalUrl: testUrl }, {}, jest.fn());

            const errorMsg = 'Processing Failed';
            messageHandler({
                action: 'SHOW_ERROR',
                originalUrl: testUrl,
                error: errorMsg
            }, {}, jest.fn());

            const overlay = document.querySelector(`[id="webwardrobe-overlay-${testUrl}"]`);
            expect(overlay.textContent).toContain(errorMsg);
            expect(overlay.style.backgroundColor).toContain('rgba(255, 0, 0, 0.9)');
        });

        test('SHOW_ERROR: should alert if overlay missing', () => {
            global.window.alert = jest.fn();

            messageHandler({
                action: 'SHOW_ERROR',
                originalUrl: testUrl,
                error: 'Fail'
            }, {}, jest.fn());

            expect(global.window.alert).toHaveBeenCalledWith(expect.stringContaining('Fail'));
        });

        test('SHOW_ERROR: click should dismiss overlay', () => {
            messageHandler({ action: 'SHOW_PROCESSING', originalUrl: testUrl }, {}, jest.fn());
            messageHandler({ action: 'SHOW_ERROR', originalUrl: testUrl, error: 'Fail' }, {}, jest.fn());

            const overlay = document.querySelector(`[id="webwardrobe-overlay-${testUrl}"]`);
            overlay.click();

            expect(document.querySelector(`[id="webwardrobe-overlay-${testUrl}"]`)).toBeNull();
        });

        test('SHOW_TOPUP_PROMPT: should show insufficient credits', async () => {
            messageHandler({
                action: 'SHOW_TOPUP_PROMPT',
                originalUrl: testUrl
            }, {}, jest.fn());

            const wrapper = document.querySelector('[data-webwardrobe-wrapper="true"]');
            const overlay = wrapper.querySelector(`[id="webwardrobe-overlay-${testUrl}"]`);

            expect(overlay.textContent).toContain('Insufficient Credits');

            // Check topup button
            const btn = overlay.querySelector('button');
            expect(btn.textContent).toBe('Top Up Credits');

            // Wait for fetch promise to resolve the url update
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            btn.click();
            expect(global.window.open).toHaveBeenCalledWith('https://mock-payment-url.com', '_blank');
        });

        test('SHOW_TOPUP_PROMPT: cancel should remove overlay', () => {
            messageHandler({
                action: 'SHOW_TOPUP_PROMPT',
                originalUrl: testUrl
            }, {}, jest.fn());

            const overlay = document.querySelector(`[id="webwardrobe-overlay-${testUrl}"]`);
            const closeDiv = Array.from(overlay.querySelectorAll('div')).find(d => d.textContent === 'Cancel');

            closeDiv.click();
            expect(document.querySelector(`[id="webwardrobe-overlay-${testUrl}"]`)).toBeNull();
        });
    });
});
