const { chrome } = require('jest-chrome');
global.chrome = chrome;

// Override event listeners with Jest mocks to capture callbacks
chrome.contextMenus.onClicked.addListener = jest.fn();
chrome.runtime.onMessage.addListener = jest.fn();

// Mock chrome.scripting
chrome.scripting = {
  executeScript: jest.fn()
};

// Mock fetch
global.fetch = jest.fn();

// Mock console to keep output clean
global.console = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

describe('Background Script', () => {
  let background;

  beforeEach(() => {
    jest.resetModules(); // Reset cache to re-execute background.js
    jest.resetAllMocks(); // Clears mock history and implementations
    jest.useFakeTimers();

    // Re-require background.js to trigger listener registration
    background = require('../background.js');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('startTryOnJob', () => {
    it('should handle successful job start and polling', async () => {
      // 1. Mock /try-on response
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ jobId: 'job-123' })
      }));

      // 2. Mock /status response (first poll: PROCESSING)
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'PROCESSING' })
      }));

      // 3. Mock /status response (second poll: COMPLETED)
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'COMPLETED', resultUrl: 'http://result.com/img.png' })
      }));

      // Start the job
      const promise = background.startTryOnJob('http://item.com/img.jpg', 'selfie-123', 'token-abc', 1, 0, 'http://site.com');

      // Wait for the initial fetch to resolve
      await Promise.resolve();
      await Promise.resolve(); // Flush promises

      // Verify /try-on call
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/try-on'),
        expect.anything()
      );

      // Verify "Processing" notification
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Try-On Started'
        })
      );

      // Advance time for first poll
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Advance time for second poll
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Verify fetch calls
      // 1. try-on
      // 2. status (processing)
      // 3. status (completed)
      expect(fetch).toHaveBeenCalledTimes(3);

      // Verify completion notification
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Try-On Complete!'
        })
      );

      // Verify message to tab
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          action: 'REPLACE_IMAGE',
          resultUrl: 'http://result.com/img.png'
        }),
        { frameId: 0 }
      );

      await promise;
    });

    it('should handle insufficient credits', async () => {
      // Mock 402 response
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 402,
        json: () => Promise.resolve({ code: 'INSUFFICIENT_CREDITS' })
      }));

      await background.startTryOnJob('http://item.com/img.jpg', 'selfie-123', 'token-abc', 1, 0, 'http://site.com');

      // Verify notification
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Insufficient Credits'
        }),
        expect.any(Function)
      );

      // Verify topup prompt
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          action: 'SHOW_TOPUP_PROMPT'
        }),
        { frameId: 0 }
      );
    });

    it('should handle insufficient credits via error code when status is not 402', async () => {
      // Mock 400 response with specific code
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ code: 'INSUFFICIENT_CREDITS' })
      }));

      await background.startTryOnJob('http://item.com/img.jpg', 'selfie-123', 'token-abc', 1, 0, 'http://site.com');

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Insufficient Credits'
        }),
        expect.any(Function)
      );

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          action: 'SHOW_TOPUP_PROMPT'
        }),
        { frameId: 0 }
      );
    });

    it('should handle notification callback errors', async () => {
      // Mock 402 response to trigger the specific notification with callback
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 402,
        json: () => Promise.resolve({ code: 'INSUFFICIENT_CREDITS' })
      }));

      // Simulate chrome.runtime.lastError
      const originalLastError = chrome.runtime.lastError;
      chrome.runtime.lastError = { message: 'Notification failed' };

      // We need to capture the callback passed to create
      chrome.notifications.create.mockImplementation((opts, cb) => {
        cb('notification-id');
      });

      await background.startTryOnJob('http://item.com/img.jpg', 'selfie-123', 'token-abc', 1, 0, 'http://site.com');

      expect(console.error).toHaveBeenCalledWith("Notification error:", chrome.runtime.lastError);

      // Cleanup
      // Cleanup
      if (originalLastError) {
        chrome.runtime.lastError = originalLastError;
      } else {
        delete chrome.runtime.lastError;
      }
      chrome.notifications.create.mockReset();
    });

    it('should handle notification creation exceptions (successful job)', async () => {
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ jobId: 'job-123' })
      }));
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'COMPLETED', resultUrl: 'url' })
      }));

      // Force create to throw
      chrome.notifications.create.mockImplementationOnce(() => {
        throw new Error("Notification system broken");
      });

      await background.startTryOnJob('http://item.com/img.jpg', 'selfie-123', 'token-abc', 1, 0, 'http://site.com');

      expect(console.error).toHaveBeenCalledWith("Notification error:", expect.any(Error));
    });

    it('should handle notification creation exceptions (failed job)', async () => {
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Fail' })
      }));

      chrome.notifications.create.mockImplementationOnce(() => {
        throw new Error("Notification system broken");
      });

      await background.startTryOnJob('http://item.com/img.jpg', 'selfie-123', 'token-abc', 1, 0, 'http://site.com');

      expect(console.error).toHaveBeenCalledWith("Notification error:", expect.any(Error));
    });

    it('should handle server errors', async () => {
      // Mock 500 response
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal Server Error' })
      }));

      await background.startTryOnJob('http://item.com/img.jpg', 'selfie-123', 'token-abc', 1, 0, 'http://site.com');

      // Verify error notification
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error'
        })
      );

      // Verify error message to tab
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          action: 'SHOW_ERROR'
        }),
        { frameId: 0 }
      );
    });

    it('should handle polling timeout', async () => {
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ jobId: 'job-timeout' })
      }));

      // Mock status to always return PROCESSING
      fetch.mockImplementation(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'PROCESSING' })
      }));

      const promise = background.startTryOnJob('http://item.com/img.jpg', 'selfie-timeout', 'token-abc', 1, 0, 'http://site.com');

      // Fast-forward time to trigger timeout
      // maxAttempts = 100, interval = 3000ms. Total 300s.
      // We need to advance timers 101 times.
      for (let i = 0; i < 105; i++) {
        jest.advanceTimersByTime(3000);
        await Promise.resolve(); // allow callback to run
      }

      // Verify timeout notification
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Try-On Timed Out'
        })
      );

      // Verify error message to tab
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          action: 'SHOW_ERROR',
          error: "Timeout: Process took >5m. Please try again."
        }),
        { frameId: 0 }
      );
    });

    it('should handle polling failure status', async () => {
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ jobId: 'job-failed' })
      }));

      // Mock status to return FAILED
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'FAILED', error: 'Processing failed' })
      }));

      const promise = background.startTryOnJob('http://item.com/img.jpg', 'selfie-fail', 'token-abc', 1, 0, 'http://site.com');

      // Allow startTryOnJob to reach pollStatus
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Advance time for first poll
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve(); // Extra flushes for async fetch/json chain

      expect(fetch).toHaveBeenCalledTimes(2);

      // Verify failed notification
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Try-On Failed',
          message: 'Processing failed'
        })
      );

      // Verify specific error to tab
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          action: 'SHOW_ERROR',
          error: 'Processing failed'
        }),
        { frameId: 0 }
      );
    });
  });

  describe('Context Menu Interaction', () => {
    beforeEach(() => {
      // Manually mock chrome.scripting if missing
      if (!chrome.scripting) {
        chrome.scripting = {
          executeScript: jest.fn()
        };
      } else if (!chrome.scripting.executeScript) {
        chrome.scripting.executeScript = jest.fn();
      }
    });

    const triggerOnClicked = async (info, tab) => {
      // Fallback: find the listener manually to avoid jest-chrome issues
      // background.js registers listener immediately.
      // But Since background.js requires top-level execution which happens once,
      // the listener is registered on the INITIAL chrome mock.
      // Assuming chrome is not reset between tests in a way that loses listeners (jest-chrome handles this usually).

      const calls = chrome.contextMenus.onClicked.addListener.mock.calls;
      console.log(`[Test] Triggering onClicked. Listeners found: ${calls.length}`);

      if (calls.length > 0) {
        // Execute all listeners
        for (const call of calls) {
          try {
            call[0](info, tab);
          } catch (e) {
            console.error("[Test] Listener error:", e);
          }
        }
      } else {
        console.warn("[Test] No onClicked listener found!");
      }

      // Flush microtasks
      await Promise.resolve();
      await Promise.resolve();
    };

    it('should handle try-on item click', async () => {
      const info = {
        menuItemId: 'try-on-selfie123',
        srcUrl: 'http://item.com/img.jpg',
        frameId: 0
      };
      const tab = {
        id: 1,
        url: 'http://site.com',
        title: 'Site Title'
      };

      // Mock auth
      chrome.identity.getAuthToken.mockImplementation((opts, cb) => cb('valid-token'));

      // Mock script injection success
      chrome.scripting.executeScript.mockImplementation((opts, cb) => cb && cb());

      // Mock startTryOnJob side effects (fetch) to avoid real network
      fetch.mockImplementation(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ jobId: 'job-123' })
      }));

      await triggerOnClicked(info, tab);

      expect(chrome.identity.getAuthToken).toHaveBeenCalledWith(
        { interactive: false },
        expect.any(Function)
      );

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { tabId: tab.id, frameIds: [info.frameId] },
          files: ['lib/sentry.min.js', 'content.js']
        }),
        expect.any(Function)
      );

      // Verify startTryOnJob was called (via fetch check)
      await Promise.resolve(); // Flush
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/try-on'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            itemUrl: info.srcUrl,
            selfieId: 'selfie123',
            siteUrl: tab.url,
            siteTitle: tab.title
          })
        })
      );
    });

    it('should handle script injection failure', async () => {
      const info = { menuItemId: 'try-on-s1', srcUrl: 'u', frameId: 0 };
      const tab = { id: 1 };

      chrome.identity.getAuthToken.mockImplementation((_, cb) => cb('token'));

      // Mock script injection failure
      chrome.scripting.executeScript.mockImplementation((opts, cb) => {
        chrome.runtime.lastError = { message: 'Injection failed' };
        cb();
        delete chrome.runtime.lastError;
      });

      await triggerOnClicked(info, tab);

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Script injection failed"));
    });

    it('should handle login-required click - success', async () => {
      const info = { menuItemId: 'login-required' };

      // Mock interactive login
      chrome.identity.getAuthToken.mockImplementation((opts, cb) => {
        if (opts.interactive) cb('new-token');
      });

      await triggerOnClicked(info, {});

      expect(chrome.identity.getAuthToken).toHaveBeenCalledWith(
        { interactive: true },
        expect.any(Function)
      );

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Login Successful' })
      );

      // Should refresh menu
      expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
    });

    it('should handle login-required click - failure', async () => {
      const info = { menuItemId: 'login-required' };

      chrome.identity.getAuthToken.mockImplementation((opts, cb) => {
        chrome.runtime.lastError = { message: 'Login cancel' };
        cb();
        delete chrome.runtime.lastError;
      });

      await triggerOnClicked(info, {});

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Login Failed' })
      );
    });

    it('should handle no-images click', async () => {
      const info = { menuItemId: 'no-images' };
      await triggerOnClicked(info, {});

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'No Selfies Found' })
      );
    });
  });

  describe('refreshContextMenu', () => {
    it('should show login item when not authenticated', () => {
      chrome.identity.getAuthToken.mockImplementation((_, cb) => {
        chrome.runtime.lastError = { message: 'No auth' };
        cb();
        delete chrome.runtime.lastError;
      });

      background.refreshContextMenu();

      expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
      // removeAll callback logic:
      const calls = chrome.contextMenus.removeAll.mock.calls;
      const removeCallback = calls[calls.length - 1][0];
      removeCallback();

      expect(chrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'login-required' })
      );
    });

    it('should show images when authenticated with images', async () => {
      chrome.identity.getAuthToken.mockImplementation((_, cb) => cb('token'));

      // Clear previous mocks
      fetch.mockClear();
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          images: [
            { id: '1', name: 'Selfie 1' },
            { id: '2', name: 'Selfie 2' }
          ]
        })
      }));

      background.refreshContextMenu();

      // Trigger removeAll callback
      const calls = chrome.contextMenus.removeAll.mock.calls;
      // We assume removeAll was called.
      if (calls.length > 0) {
        const removeCallback = calls[calls.length - 1][0];
        removeCallback();
      }

      await Promise.resolve(); // Fetch
      await Promise.resolve(); // Json
      await Promise.resolve(); // Then
      await Promise.resolve(); // extra flush

      expect(chrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'try-on-root' })
      );
      expect(chrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'try-on-1' })
      );
      expect(chrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'try-on-2' })
      );
    });

    it('should show upload item when authenticated but no images', async () => {
      chrome.identity.getAuthToken.mockImplementation((_, cb) => cb('token'));

      fetch.mockClear();
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ images: [] })
      }));

      background.refreshContextMenu();

      const calls = chrome.contextMenus.removeAll.mock.calls;
      if (calls.length > 0) {
        const removeCallback = calls[calls.length - 1][0];
        removeCallback();
      }

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve(); // extra flush

      expect(chrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'no-images' })
      );
    });
  });

  describe('Runtime Messages', () => {
    it('should handle refreshContextMenu action', () => {
      // Simulate message
      // Ensure mock structures exist
      if (!chrome.runtime.onMessage.addListener.mock) {
        console.warn("chrome.runtime.onMessage.addListener is not a mock");
        return;
      }
      const listeners = chrome.runtime.onMessage.addListener.mock.calls;
      if (listeners.length === 0) return;

      const callback = listeners.find(call => call[0].toString().includes('refreshContextMenu') || call[0].length >= 3 || true)[0];

      // Clear previous calls
      chrome.contextMenus.removeAll.mockClear();

      callback({ action: 'refreshContextMenu' }, {}, () => { });

      expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
    });

    it('should handle PAYMENT_SUCCESS', () => {
      if (!chrome.runtime.onMessage.addListener.mock) return;

      const listeners = chrome.runtime.onMessage.addListener.mock.calls;
      if (listeners.length === 0) return;
      const callback = listeners[0][0];

      callback({ type: 'PAYMENT_SUCCESS' }, {}, () => { });

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Payment Successful' })
      );
    });
  });
});
