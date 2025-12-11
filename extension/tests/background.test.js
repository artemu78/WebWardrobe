const { chrome } = require('jest-chrome');
global.chrome = chrome;

// Mock fetch
global.fetch = jest.fn();

// Mock console to keep output clean
global.console = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

const background = require('../background.js');

describe('Background Script', () => {
  beforeEach(() => {
    jest.resetAllMocks(); // Clears mock history and implementations
    jest.useFakeTimers();
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
});
