// content.js
if (typeof Sentry !== 'undefined') {
  Sentry.init({
    dsn: "https://72cabbbdafe87f51a39927bec3d9e076@o4508982929588224.ingest.de.sentry.io/4508982935617616",
  });
}

if (window.webWardrobeContentScriptInjected) {
  // Already injected
} else {
  window.webWardrobeContentScriptInjected = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { action, originalUrl, resultUrl, error } = request;

    // Find all images with the matching src
    const images = Array.from(document.querySelectorAll('img'));

    // Helper to normalize URLs for comparison
    const normalizeUrl = (url) => {
      try {
        return decodeURIComponent(url).split('?')[0]; // Compare base URL without params as fallback?
      } catch (e) {
        return url;
      }
    };

    // Helper to ensuring image is wrapped for overlay positioning
    const ensureImageWrapper = (img) => {
      // Check if already wrapped by us (using a specific class or data attribute)
      if (img.parentNode.hasAttribute('data-webwardrobe-wrapper')) {
        return img.parentNode;
      }

      // Create wrapper
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-webwardrobe-wrapper', 'true');

      // Preserve some computed styles that might affect layout
      const computedStyle = window.getComputedStyle(img);
      const isAbsolute = computedStyle.position === 'absolute' || computedStyle.position === 'fixed';

      if (isAbsolute) {
        // Transfer absolute positioning to wrapper to prevent layout shift ("jumping")
        wrapper.style.position = computedStyle.position;
        wrapper.style.top = computedStyle.top;
        wrapper.style.left = computedStyle.left;
        wrapper.style.right = computedStyle.right;
        wrapper.style.bottom = computedStyle.bottom;
        wrapper.style.zIndex = computedStyle.zIndex;

        // Transfer margins to wrapper
        wrapper.style.marginTop = computedStyle.marginTop;
        wrapper.style.marginBottom = computedStyle.marginBottom;
        wrapper.style.marginLeft = computedStyle.marginLeft;
        wrapper.style.marginRight = computedStyle.marginRight;
      } else {
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block'; // Minimizes layout disruption for static images
      }

      wrapper.style.lineHeight = '0'; // Fix specific gap issue with inline-block images

      if (computedStyle.display === 'block') {
        wrapper.style.display = 'block';
        wrapper.style.width = 'fit-content';
      }

      img.parentNode.insertBefore(wrapper, img);
      wrapper.appendChild(img);

      if (isAbsolute) {
        // Reset image styles since the wrapper now handles positioning
        img.style.position = 'static';
        img.style.margin = '0';
      }
      return wrapper;
    };

    for (let img of images) {
      // Robust matching: exact match OR decoded match
      const match = img.src === originalUrl ||
        decodeURIComponent(img.src) === decodeURIComponent(originalUrl);

      if (match) {

        if (action === "SHOW_PROCESSING") {
          const wrapper = ensureImageWrapper(img);

          // Check if overlay already exists
          if (wrapper.querySelector(`div[id="webwardrobe-overlay-${originalUrl}"]`)) return;

          const overlay = document.createElement('div');
          overlay.id = `webwardrobe-overlay-${originalUrl}`;
          overlay.style.position = 'absolute';
          overlay.style.top = '0';
          overlay.style.left = '0';
          overlay.style.width = '100%';
          overlay.style.height = '100%';
          overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
          overlay.style.color = 'white';
          overlay.style.display = 'flex';
          overlay.style.justifyContent = 'center';
          overlay.style.alignItems = 'center';
          overlay.style.fontSize = '16px';
          overlay.style.fontWeight = 'bold';
          overlay.style.zIndex = '1000';
          overlay.style.padding = '10px';
          overlay.style.textAlign = 'center';
          overlay.style.wordBreak = 'break-word';
          overlay.style.overflowY = 'auto'; // Handle scroll within overlay
          overlay.textContent = 'Processing Try-On...';

          wrapper.appendChild(overlay);

        } else if (action === "REPLACE_IMAGE") {
          // Remove overlay if exists
          // Since we wrap, the overlay is a sibling of img, inside wrapper
          const overlay = img.parentNode.querySelector(`div[id="webwardrobe-overlay-${originalUrl}"]`);
          if (overlay) overlay.remove();

          img.src = resultUrl;
          img.style.border = "2px solid #4285f4";
          img.style.transition = "opacity 0.5s";
          img.style.opacity = "0.5";
          setTimeout(() => img.style.opacity = "1", 100);

        } else if (action === "SHOW_ERROR") {
          // Update overlay to show error
          const overlay = document.getElementById(`webwardrobe-overlay-${originalUrl}`);

          if (overlay) {
            overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.9)'; // Darker red
            overlay.textContent = (error || 'Try-On Failed') + '\n(Click to dismiss)';
            overlay.style.cursor = 'pointer';
            overlay.title = "Click to dismiss";

            // Make it persistent (remove auto-hide if any)
            overlay.onclick = () => overlay.remove();
          } else {
            // Fallback: try to create a new error overlay if none exists
            // This might happen if SHOW_PROCESSING wasn't called (fast fail)
            // For now, consistent with previous behavior + alert fallback
            alert(`WebWardrobe Error: ${error}`);
          }

        } else if (action === "SHOW_TOPUP_PROMPT") {
          const wrapper = ensureImageWrapper(img);

          // Remove previous overlay if exists
          const oldOverlay = wrapper.querySelector(`div[id="webwardrobe-overlay-${originalUrl}"]`);
          if (oldOverlay) oldOverlay.remove();

          const overlay = document.createElement('div');
          overlay.id = `webwardrobe-overlay-${originalUrl}`;
          overlay.style.position = 'absolute';
          overlay.style.top = '0';
          overlay.style.left = '0';
          overlay.style.width = '100%';
          overlay.style.height = '100%';
          overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
          overlay.style.color = 'white';
          overlay.style.display = 'flex';
          overlay.style.flexDirection = 'column';
          overlay.style.justifyContent = 'center';
          overlay.style.alignItems = 'center';
          overlay.style.fontSize = '14px';
          overlay.style.zIndex = '1000';
          overlay.style.padding = '10px';
          overlay.style.textAlign = 'center';
          overlay.style.wordBreak = 'break-word';

          const msg = document.createElement('div');
          msg.textContent = "Insufficient Credits";
          msg.style.fontWeight = 'bold';
          msg.style.marginBottom = '10px';
          overlay.appendChild(msg);

          // Fetch payment URL
          let paymentUrl = "https://web-wardrobe.netlify.app/";
          fetch("https://nw2ghqgbe5.execute-api.us-east-1.amazonaws.com/prod/payment-url")
            .then(res => res.json())
            .then(data => { paymentUrl = data; })
            .catch(err => console.error("Failed to fetch payment URL", err));

          const btn = document.createElement('button');
          btn.textContent = "Top Up Credits";
          btn.style.backgroundColor = '#4285f4';
          btn.style.color = 'white';
          btn.style.border = 'none';
          btn.style.padding = '8px 16px';
          btn.style.borderRadius = '4px';
          btn.style.cursor = 'pointer';
          btn.onclick = (e) => {
            e.stopPropagation();
            window.open(paymentUrl, "_blank");
          };
          overlay.appendChild(btn);

          const close = document.createElement('div');
          close.textContent = "Cancel";
          close.style.fontSize = "12px";
          close.style.marginTop = "10px";
          close.style.cursor = "pointer";
          close.style.textDecoration = "underline";
          close.onclick = (e) => {
            e.stopPropagation();
            overlay.remove();
          }
          overlay.appendChild(close);

          wrapper.appendChild(overlay);
        }
      }
    }
  });
}
