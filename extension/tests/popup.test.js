/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');

describe('Extension Popup', () => {
    beforeEach(() => {
        document.documentElement.innerHTML = html;

        // Mock global objects
        global.fetch = jest.fn().mockResolvedValue({
            status: 200,
            ok: true,
            json: async () => ({})
        });

        global.Sentry = { init: jest.fn() };
        global.window.alert = jest.fn();
        global.window.confirm = jest.fn();
        global.window.prompt = jest.fn();

        // Mock localStorage
        const localStorageMock = (function () {
            let store = {};
            return {
                getItem: jest.fn(key => store[key] || null),
                setItem: jest.fn((key, value) => { store[key] = value.toString(); }),
                removeItem: jest.fn(key => { delete store[key]; }),
                clear: jest.fn(() => { store = {}; })
            };
        })();
        Object.defineProperty(window, 'localStorage', { value: localStorageMock });

        // Mock chrome API
        global.chrome = {
            identity: {
                getAuthToken: jest.fn(),
                removeCachedAuthToken: jest.fn()
            },
            runtime: {
                lastError: null,
                sendMessage: jest.fn()
            },
            tabs: {
                create: jest.fn()
            }
        };

        jest.resetModules();
    });

    function loadPopup() {
        let domLoadedCallback = null;
        const addEventListenerSpy = jest.spyOn(document, 'addEventListener').mockImplementation((event, callback) => {
            if (event === 'DOMContentLoaded') {
                domLoadedCallback = callback;
            }
        });

        require('../popup.js');

        if (domLoadedCallback) {
            domLoadedCallback();
        }

        addEventListenerSpy.mockRestore();
    }

    test('Snapshot: Initial State (Logged Out)', () => {
        loadPopup();
        expect(document.getElementById('auth-section').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('main-section').classList.contains('hidden')).toBe(true);
        expect(document.body).toMatchSnapshot();
    });

    test('Login flow: success', () => {
        const token = 'mock-token';
        chrome.identity.getAuthToken.mockImplementation(({ interactive }, callback) => {
            if (interactive) {
                callback(token);
            }
        });

        loadPopup(); // Attach listeners

        const loginBtn = document.getElementById('login-btn');
        loginBtn.click();

        expect(chrome.identity.getAuthToken).toHaveBeenCalledWith({ interactive: true }, expect.any(Function));

        // Should switch to main section and load images
        // Since loadImages is async, we might need to wait or mock fetch appropriately first
        // But checking immediate UI calls

        expect(localStorage.removeItem).toHaveBeenCalledWith('signedOut');
        expect(document.getElementById('auth-section').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('main-section').classList.contains('hidden')).toBe(false);

        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/user/images'), expect.anything());
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/user/generations'), expect.anything());
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: "refreshContextMenu" });
    });

    test('Auto-login if not signed out', () => {
        localStorage.getItem.mockReturnValue(null); // Not signed out
        const token = 'mock-auto-token';
        chrome.identity.getAuthToken.mockImplementation(({ interactive }, callback) => {
            if (!interactive) callback(token);
        });

        loadPopup();

        expect(chrome.identity.getAuthToken).toHaveBeenCalledWith({ interactive: false }, expect.any(Function));
        // Verify we proceeded to showMain
        expect(document.getElementById('main-section').classList.contains('hidden')).toBe(false);
    });

    test('Logout flow', () => {
        // Simulate already logged in
        localStorage.getItem.mockReturnValue(null);
        chrome.identity.getAuthToken.mockImplementation((opts, cb) => cb('token'));

        loadPopup();

        expect(document.getElementById('logout-btn')).toBeTruthy();

        const logoutBtn = document.getElementById('logout-btn');
        chrome.identity.removeCachedAuthToken.mockImplementation((opts, cb) => cb());

        logoutBtn.click();

        expect(chrome.identity.removeCachedAuthToken).toHaveBeenCalledWith({ token: 'token' }, expect.any(Function));

        // After callback, should show login
        // But the callback is async in real life, sync in mock?
        // Our mock calls callback immediately.

        expect(localStorage.setItem).toHaveBeenCalledWith('signedOut', 'true');
        expect(document.getElementById('auth-section').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('main-section').classList.contains('hidden')).toBe(true);
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: "refreshContextMenu" });
    });

    test('Top Up button opens tariff page', () => {
        loadPopup();
        const topupBtn = document.getElementById('topup-btn');
        // Define navigator.language
        Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true });

        topupBtn.click();

        expect(chrome.tabs.create).toHaveBeenCalledWith(
            expect.objectContaining({ url: expect.stringContaining('#tariffs') })
        );
    });

    test('Snapshot: Logged In State with Images', async () => {
        // Simulate logged in
        const token = 'token';
        chrome.identity.getAuthToken.mockImplementation((opts, cb) => cb(token));

        const mockImages = {
            credits: 10,
            images: [
                { id: '1', name: 'Selfie 1', s3Url: 'http://example.com/1.jpg', thumbnailUrl: 'http://example.com/1_thumb.jpg' }
            ]
        };

        const mockGens = {
            generations: [
                { jobId: 'g1', resultUrl: 'http://example.com/gen1.png', siteUrl: 'http://site.com', siteTitle: 'Site', timestamp: '2023-01-01T12:00:00Z' }
            ]
        };

        global.fetch
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => mockImages
            })
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => mockGens
            });

        loadPopup();

        // Allow promises to resolve
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);
        await new Promise(process.nextTick); // Add one more tick just in case

        // Verify fetch calls
        expect(global.fetch).toHaveBeenCalledTimes(2);

        expect(document.getElementById('credit-count').textContent).toBe('10');
        expect(document.getElementById('selfies-list').children.length).toBe(1);
        expect(document.getElementById('generated-images-list').children.length).toBe(1);

        expect(document.body).toMatchSnapshot();
    });

    test('Toggle functionality', () => {
        loadPopup();
        const btn = document.querySelector('[data-toggle-button="selfies-list"]');
        const list = document.getElementById('selfies-list');

        // Initial state should be visible or hidden based on HTML
        // Looking at HTML, it doesn't have 'hidden' class initially
        expect(list.classList.contains('hidden')).toBe(false);

        btn.click();
        expect(list.classList.contains('hidden')).toBe(true);

        btn.click();
        expect(list.classList.contains('hidden')).toBe(false);
    });

    test('Image Actions: Delete Selfie', async () => {
        const token = 'token';
        chrome.identity.getAuthToken.mockImplementation((opts, cb) => cb(token));
        global.window.confirm.mockReturnValue(true);

        const mockImages = { images: [{ id: '1', name: 'Selfie 1', s3Url: 'url', thumbnailUrl: 'thumb' }] };

        global.fetch
            .mockResolvedValueOnce({
                status: 200, ok: true,
                json: async () => mockImages
            })
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({}) }) // generations
            .mockResolvedValueOnce({ status: 200, ok: true }) // delete
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ images: [] }) }); // reload

        loadPopup();
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        const deleteBtn = document.querySelector('.delete-btn');
        expect(deleteBtn).toBeTruthy();

        deleteBtn.click();
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        expect(window.confirm).toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/user/images/1'),
            expect.objectContaining({ method: 'DELETE' })
        );
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: "refreshContextMenu" });
    });

    test('Image Actions: Rename Selfie', async () => {
        const token = 'token';
        chrome.identity.getAuthToken.mockImplementation((opts, cb) => cb(token));
        global.window.prompt.mockReturnValue('New Name');

        const mockImages = { images: [{ id: '1', name: 'Old Name', s3Url: 'url' }] };

        global.fetch
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => mockImages })
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({}) })
            .mockResolvedValueOnce({ status: 200, ok: true }) // patch
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ images: [{ id: '1', name: 'New Name' }] }) });

        loadPopup();
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        const renameBtn = document.querySelector('.rename-btn');
        renameBtn.click();

        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        expect(window.prompt).toHaveBeenCalledWith("Enter new name:", "Old Name");
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/user/images/1'),
            expect.objectContaining({
                method: 'PATCH',
                body: JSON.stringify({ name: 'New Name' })
            })
        );
    });

    test('Generated Image Actions: Delete', async () => {
        const token = 'token';
        chrome.identity.getAuthToken.mockImplementation((opts, cb) => cb(token));
        global.window.confirm.mockReturnValue(true);

        const mockGens = { generations: [{ jobId: 'g1', resultUrl: 'url' }] };

        global.fetch
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ images: [] }) })
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => mockGens })
            .mockResolvedValueOnce({ status: 200, ok: true }) // delete
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ generations: [] }) }); // reload

        loadPopup();
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        const deleteGenBtn = document.querySelector('.delete-gen-btn');
        expect(deleteGenBtn).toBeTruthy();

        deleteGenBtn.click();
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/user/generations/g1'),
            expect.objectContaining({ method: 'DELETE' })
        );
    });

    test('File Upload Flow', async () => {
        const token = 'token';
        chrome.identity.getAuthToken.mockImplementation((opts, cb) => cb(token));

        // Mock FileReader
        global.FileReader = class {
            readAsDataURL() {
                this.result = 'data:image/png;base64,mock';
                // Trigger onload on the next tick to simulate async file reading
                setTimeout(() => {
                    this.onload && this.onload({ target: { result: this.result } });
                }, 10);
            }
        };

        // Mock document.createElement to handle img and canvas
        const originalCreateElement = document.createElement.bind(document);
        const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
            if (tagName === 'img') {
                const img = {
                    width: 100,
                    height: 100,
                    _src: '',
                    set src(val) {
                        this._src = val;
                        // Trigger onload when src is set
                        setTimeout(() => {
                            this.onload && this.onload();
                        }, 10);
                    },
                    get src() { return this._src; }
                };
                return img;
            }
            if (tagName === 'canvas') {
                return {
                    width: 0,
                    height: 0,
                    getContext: () => ({ drawImage: jest.fn() }),
                    toBlob: (cb) => cb(new Blob(['blob'], { type: 'image/png' })),
                };
            }
            return originalCreateElement(tagName);
        });

        global.fetch
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ images: [] }) })
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ generations: [] }) })
            // Upload flow fetches:
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({
                    uploadUrl: 'http://s3/put',
                    thumbnailUploadUrl: 'http://s3/thumb',
                    s3Key: 'key',
                    fileId: 'fid'
                })
            }) // get presigned
            .mockResolvedValueOnce({ status: 200, ok: true }) // put original
            .mockResolvedValueOnce({ status: 200, ok: true }) // put thumb
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({}) }) // confirm
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ images: [{ id: 'new', name: 'TestImg' }] }) }); // reload

        loadPopup();
        await new Promise(process.nextTick);

        const fileInput = document.getElementById('image-file');
        const nameInput = document.getElementById('image-name');
        const uploadBtn = document.getElementById('upload-btn');

        // Simulate file selection
        const file = new File(['content'], 'test.png', { type: 'image/png' });
        Object.defineProperty(fileInput, 'files', { value: [file] });

        // Trigger change event for preview logic
        fileInput.dispatchEvent(new Event('change'));

        // Set name
        nameInput.value = 'TestImg';

        // Click upload
        uploadBtn.click();

        // Wait for async operations (resize + fetches)
        // Needs a bit more time for the setTimeouts in mocks
        await new Promise(r => setTimeout(r, 100));
        await new Promise(process.nextTick);

        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/upload-url'), expect.any(Object));
        expect(global.fetch).toHaveBeenCalledWith('http://s3/put', expect.objectContaining({ method: 'PUT' }));
        expect(global.fetch).toHaveBeenCalledWith('http://s3/thumb', expect.objectContaining({ method: 'PUT' }));
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/user/images'),
            expect.objectContaining({ method: 'POST' })
        );

        // Should have reloaded images
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/user/images'), expect.objectContaining({ headers: expect.anything() }));

        createElementSpy.mockRestore();
    });

    test('UI: Drag and Drop visual feedback', () => {
        loadPopup();
        const dropZone = document.getElementById('upload-drop-zone');
        const previewState = document.getElementById('upload-preview-state');

        // Ensure preview is hidden
        previewState.classList.add('hidden');

        dropZone.dispatchEvent(new Event('dragover'));
        expect(dropZone.classList.contains('border-primary')).toBe(true);

        dropZone.dispatchEvent(new Event('dragleave'));
        expect(dropZone.classList.contains('border-primary')).toBe(false);
    });

    test('Modal interaction', async () => {
        const token = 'token';
        chrome.identity.getAuthToken.mockImplementation((opts, cb) => cb(token));
        const mockImages = { images: [{ id: '1', s3Url: 'full-res.jpg' }] };

        global.fetch
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => mockImages })
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({}) });

        loadPopup();
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        const modal = document.getElementById("image-modal");
        const modalImg = document.getElementById("modal-img");
        const closeBtn = document.getElementById("modal-close");

        const viewBtn = document.querySelector('.view-btn');
        viewBtn.click();

        expect(modal.style.display).toBe("block");
        expect(modalImg.src).toContain("full-res.jpg");

        closeBtn.click();
        expect(modal.style.display).toBe("none");

        // Open again and click outside
        viewBtn.click();
        window.onclick({ target: modal });
        expect(modal.style.display).toBe("none");
    });

    test('Low credits warning', async () => {
        const token = 'token';
        chrome.identity.getAuthToken.mockImplementation((opts, cb) => cb(token));

        global.fetch.mockResolvedValueOnce({
            status: 200, ok: true,
            json: async () => ({ credits: 0, images: [] })
        });

        loadPopup();
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        const creditCount = document.getElementById('credit-count');
        expect(creditCount.classList.contains('text-red-500')).toBe(true);
    });

    test('Session Expired (401)', async () => {
        const token = 'token';
        chrome.identity.getAuthToken.mockImplementation((opts, cb) => cb(token));

        global.fetch.mockResolvedValue({
            status: 401, ok: false,
            json: async () => ({})
        });

        loadPopup();
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        const listDiv = document.getElementById('selfies-list');
        expect(listDiv.innerHTML).toContain('Session expired');
    });
});

