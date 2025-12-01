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
      const promise = background.startTryOnJob('http://item.com/img.jpg', 'selfie-123', 'token-abc', 1, 'http://site.com');
      
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
        })
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

      await background.startTryOnJob('http://item.com/img.jpg', 'selfie-123', 'token-abc', 1, 'http://site.com');

      // Verify notification
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Insufficient Credits'
        })
      );

      // Verify topup prompt
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          action: 'SHOW_TOPUP_PROMPT'
        })
      );
    });

    it('should handle server errors', async () => {
      // Mock 500 response
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal Server Error' })
      }));

      await background.startTryOnJob('http://item.com/img.jpg', 'selfie-123', 'token-abc', 1, 'http://site.com');

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
        })
      );
    });
  });
});
