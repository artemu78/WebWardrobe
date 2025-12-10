// popup.js
if (typeof Sentry !== 'undefined') {
  Sentry.init({
    dsn: "https://72cabbbdafe87f51a39927bec3d9e076@o4508982929588224.ingest.de.sentry.io/4508982935617616",
  });
}

const API_BASE_URL = "https://nw2ghqgbe5.execute-api.us-east-1.amazonaws.com/prod";
const SITE_BASE_URL = "https://web-wardrobe.netlify.app";

document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('login-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const authSection = document.getElementById('auth-section');
  const mainSection = document.getElementById('main-section');

  const topupBtn = document.getElementById('topup-btn');
  const creditCount = document.getElementById('credit-count');

  const logoutBtn = document.getElementById('logout-btn');

  // Check Auth
  if (!localStorage.getItem('signedOut')) {
    chrome.identity.getAuthToken({ interactive: false }, function (token) {
      if (token) {
        showMain(token);
      }
    });
  }

  loginBtn.addEventListener('click', () => {
    chrome.identity.getAuthToken({ interactive: true }, function (token) {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        return;
      }
      showMain(token);
    });
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      chrome.identity.getAuthToken({ interactive: false }, function (token) {
        if (token) {
          chrome.identity.removeCachedAuthToken({ token: token }, function () {
            showLogin();
          });
        } else {
          showLogin();
        }
      });
    });
  }

  if (topupBtn) {
    topupBtn.addEventListener('click', () => {
      const lang = navigator.language.split('-')[0].toUpperCase();
      const supportedLangs = ['EN', 'RU', 'DE', 'ES'];
      const finalLang = supportedLangs.includes(lang) ? lang : 'EN';

      const url = `${SITE_BASE_URL}/?lang=${finalLang}#tariffs`;
      chrome.tabs.create({ url: url });
    });
  }

  function showLogin() {
    localStorage.setItem('signedOut', 'true');
    authSection.classList.remove('hidden');
    mainSection.classList.add('hidden');

    const selfiesList = document.getElementById('selfies-list');
    if (selfiesList) selfiesList.innerHTML = '';

    const genList = document.getElementById('generated-images-list');
    if (genList) genList.innerHTML = '';

    // Refresh context menu to ensure it reflects logout state
    chrome.runtime.sendMessage({ action: "refreshContextMenu" });
  }

  // Modal Logic
  const modal = document.getElementById("image-modal");
  const modalImg = document.getElementById("modal-img");
  const modalClose = document.getElementById("modal-close");

  modalClose.onclick = function () {
    modal.style.display = "none";
  }

  window.onclick = function (event) {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  }

  // Add toggle functionality
  document.querySelectorAll('[data-toggle-button]').forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-toggle-button');
      const targetElement = document.getElementById(targetId);
      const icon = button.querySelector('.material-icons-outlined');

      if (targetElement) {
        const isHidden = targetElement.classList.toggle('hidden');
        icon.textContent = isHidden ? 'expand_more' : 'expand_less';
      }
    });
  });


  // File Upload UI
  const dropZone = document.getElementById('upload-drop-zone');
  const fileInput = document.getElementById('image-file');
  const emptyState = document.getElementById('upload-empty-state');
  const previewState = document.getElementById('upload-preview-state');
  const previewImg = document.getElementById('upload-preview-img');
  const removeBtn = document.getElementById('upload-remove-btn');

  function showPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      emptyState.classList.add('hidden');
      previewState.classList.remove('hidden');
      dropZone.classList.add('border-primary');
      dropZone.classList.remove('border-gray-300', 'dark:border-gray-600');
    };
    reader.readAsDataURL(file);
  }

  function resetUpload() {
    fileInput.value = '';
    previewImg.src = '';
    previewState.classList.add('hidden');
    emptyState.classList.remove('hidden');
    dropZone.classList.remove('border-primary');
    dropZone.classList.add('border-gray-300', 'dark:border-gray-600');
  }

  if (dropZone && fileInput && emptyState && previewState && removeBtn) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        showPreview(fileInput.files[0]);
      }
    });

    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetUpload();
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (previewState.classList.contains('hidden')) {
        dropZone.classList.add('border-primary', 'bg-gray-50', 'dark:bg-gray-700');
      }
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-primary', 'bg-gray-50', 'dark:bg-gray-700');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-primary', 'bg-gray-50', 'dark:bg-gray-700');

      if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        showPreview(e.dataTransfer.files[0]);
      }
    });
  }

  /**
   * Display the main UI, hide the authentication UI, load the user's images, and attach top-up and upload handlers.
   * @param {string} token - OAuth bearer token used for authenticated API requests.
   */
  function showMain(token) {
    localStorage.removeItem('signedOut');
    authSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
    loadImages(token);
    // Also load generated images
    loadGeneratedImages(token);

    // Refresh context menu to ensure it reflects login state
    chrome.runtime.sendMessage({ action: "refreshContextMenu" });


    document.getElementById('generated-section-title').addEventListener('dblclick', () => {
      loadGeneratedImages(token);
    });
    // Setup Profile




    // Setup Upload
    uploadBtn.onclick = async () => {
      const nameInput = document.getElementById('image-name');
      const fileInput = document.getElementById('image-file');
      const statusMsg = document.getElementById('status-msg');

      const name = nameInput.value;
      const file = fileInput.files[0];

      if (!name || !file) {
        statusMsg.textContent = "Please select a file and name it.";
        return;
      }

      statusMsg.textContent = "Processing image...";
      uploadBtn.disabled = true;

      try {
        // 0. Generate Thumbnail
        const thumbnailBlob = await resizeImage(file, 48, 48);

        // 1. Get Presigned URLs (Original + Thumbnail)
        statusMsg.textContent = "Getting upload URLs...";
        const res1 = await fetch(`${API_BASE_URL}/user/images/upload-url`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            includeThumbnail: true
          })
        });

        if (res1.status === 401) {
          throw new Error("Unauthorized. Please sign out and sign in again.");
        }

        const data1 = await res1.json();
        if (!res1.ok) throw new Error(data1.error || 'Failed to get upload URL');

        // 2. Upload to S3 (Original)
        statusMsg.textContent = "Uploading original...";
        await fetch(data1.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type }
        });

        // 3. Upload to S3 (Thumbnail)
        statusMsg.textContent = "Uploading thumbnail...";
        await fetch(data1.thumbnailUploadUrl, {
          method: 'PUT',
          body: thumbnailBlob,
          headers: { 'Content-Type': file.type }
        });

        // 4. Confirm
        statusMsg.textContent = "Saving profile...";
        const res3 = await fetch(`${API_BASE_URL}/user/images`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name,
            s3Key: data1.s3Key,
            fileId: data1.fileId,
            thumbnailS3Key: data1.thumbnailS3Key
          })
        });

        if (!res3.ok) {
          const err = await res3.json();
          throw new Error(err.error || 'Failed to save profile');
        }

        statusMsg.textContent = "Upload complete!";
        nameInput.value = '';
        resetUpload();
        loadImages(token);

        // Refresh context menu
        chrome.runtime.sendMessage({ action: "refreshContextMenu" });

      } catch (e) {
        console.error(e);
        statusMsg.textContent = "Error: " + e.message;
      } finally {
        uploadBtn.disabled = false;
      }
    };
  }

  /**
   * Load and render the current user's images into the image list and update the displayed credit count.
   *
   * Displays a loading placeholder, fetches the user's images and credit information from the API using the provided bearer token, and populates the DOM image list with thumbnail/display images, download links, and delete controls. Updates the credit-count text and sets its color to red when credits are less than or equal to zero. Shows a session-expired message for unauthorized responses and a failure message on fetch errors.
   *
   * @param {string} token - Bearer token used to authenticate requests to the images API.
   */
  async function loadImages(token) {
    const listDiv = document.getElementById('selfies-list');
    listDiv.innerHTML = '<p class="text-gray-500 dark:text-gray-400">Loading...</p>';

    try {
      const res = await fetch(`${API_BASE_URL}/user/images`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401) {
        listDiv.innerHTML = '<p class="text-red-500">Session expired. Please Sign Out.</p>';
        return;
      }

      const data = await res.json();

      // Update credits separately
      if (data.credits !== undefined) {
        creditCount.textContent = data.credits;
        if (data.credits <= 0) {
          creditCount.classList.add('text-red-500');
        } else {
          creditCount.classList.remove('text-red-500');
        }
      }

      listDiv.innerHTML = ''; // Clear loading message
      if (data.images && data.images.length > 0) {
        data.images.forEach(img => {
          const div = document.createElement('div');
          div.className = 'bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm flex items-center space-x-4';

          const displayUrl = img.thumbnailUrl || img.s3Url;

          div.innerHTML = `
            <img alt="${img.name}" class="w-16 h-16 object-cover rounded-md cursor-pointer view-btn" src="${displayUrl}">
            <div class="flex-1">
                <p class="font-medium text-gray-900 dark:text-white">${img.name}</p>
            </div>
            <div class="flex items-center space-x-1 text-gray-500 dark:text-gray-400">
                <button class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full rename-btn" title="Rename">
                    <span class="material-icons-outlined text-xl">edit</span>
                </button>
                <a href="${img.s3Url}" download="${img.name}" target="_blank" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title="Download">
                    <span class="material-icons-outlined text-xl">download</span>
                </a>
                <button class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full delete-btn" title="Delete">
                    <span class="material-icons-outlined text-xl text-red-500">delete</span>
                </button>
            </div>
          `;

          // Attach event listeners
          div.querySelector('.view-btn').onclick = () => {
            modal.style.display = "block";
            modalImg.src = img.s3Url;
          };

          div.querySelector('.rename-btn').onclick = async () => {
            const newName = prompt("Enter new name:", img.name);
            if (newName && newName !== img.name) {
              await renameImage(img.id, newName, token);
            }
          };

          div.querySelector('.delete-btn').onclick = async () => {
            if (confirm(`Delete "${img.name}"?`)) {
              await deleteImage(img.id, token);
            }
          };

          listDiv.appendChild(div);
        });
      } else {
        listDiv.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center">No selfies yet. Upload one below!</p>';
      }
    } catch (e) {
      console.error("Failed to load images:", e);
      listDiv.innerHTML = '<p class="text-red-500">Failed to load images.</p>';
    }
  }

  async function renameImage(fileId, newName, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/user/images/${fileId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newName })
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to rename (${res.status}): ${err}`);
      }

      loadImages(token); // Reload list

    } catch (e) {
      alert("Error renaming image: " + e.message);
    }
  }

  async function deleteImage(fileId, token) {
    const listDiv = document.getElementById('selfies-list');
    try {
      const res = await fetch(`${API_BASE_URL}/user/images/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error("Failed to delete");

      loadImages(token); // Reload list
      chrome.runtime.sendMessage({ action: "refreshContextMenu" });

    } catch (e) {
      alert("Error deleting image: " + e.message);
    }
  }

  function resizeImage(file, maxWidth, maxHeight) {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img');
      const reader = new FileReader();

      reader.onload = function (e) {
        img.src = e.target.result;
        img.onload = function () {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate aspect ratio
          if (width > height) {
            if (width > maxWidth) {
              height *= maxWidth / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width *= maxHeight / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            resolve(blob);
          }, file.type);
        };
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function loadGeneratedImages(token) {
    const listDiv = document.getElementById('generated-images-list');
    listDiv.innerHTML = '<p class="text-gray-500 dark:text-gray-400">Loading...</p>';

    try {
      const res = await fetch(`${API_BASE_URL}/user/generations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401) {
        listDiv.innerHTML = '<p class="text-red-500">Session expired. Please Sign Out.</p>';
        return;
      }

      const data = await res.json();
      listDiv.innerHTML = ''; // Clear loading message

      if (data.generations && data.generations.length > 0) {
        data.generations.forEach(gen => {
          const div = document.createElement('div');
          div.className = 'bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm flex items-center space-x-4';

          let timestamp = '';
          if (gen.timestamp) {
            // Ensure timestamp is treated as UTC if it doesn't have timezone info
            const timeStr = gen.timestamp.endsWith('Z') ? gen.timestamp : gen.timestamp + 'Z';
            timestamp = new Date(timeStr).toLocaleString(undefined, {
              year: 'numeric',
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
          }

          div.innerHTML = `
                    <img alt="Generated image" class="w-16 h-16 object-cover rounded-md cursor-pointer view-btn" src="${gen.resultUrl}">
                    <div class="flex-1 min-w-0">
                        <a href="${gen.siteUrl}" target="_blank" class="font-medium text-primary hover:underline line-clamp-2" title="${gen.siteTitle || 'View on site'}">${gen.siteTitle || 'View on site'}</a>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${timestamp}</p>
                    </div>
                    <div class="flex items-center space-x-1 text-gray-500 dark:text-gray-400">
                        <a href="${gen.resultUrl}" download="generated-image.png" target="_blank" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title="Download">
                            <span class="material-icons-outlined text-xl">download</span>
                        </a>
                         <button class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full delete-gen-btn" title="Delete">
                            <span class="material-icons-outlined text-xl text-red-500">delete</span>
                        </button>
                    </div>
                `;

          // Attach event listeners
          div.querySelector('.view-btn').onclick = () => {
            modal.style.display = "block";
            modalImg.src = gen.resultUrl;
          };

          div.querySelector('.delete-gen-btn').onclick = async () => {
            if (confirm(`Delete this generated image?`)) {
              await deleteGeneratedImage(gen.jobId, token);
            }
          };

          listDiv.appendChild(div);
        });
      } else {
        listDiv.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center">No generated images yet.</p>';
      }
    } catch (e) {
      console.error("Failed to load generated images:", e);
      listDiv.innerHTML = '<p class="text-red-500">Failed to load generated images.</p>';
    }
  }

  async function deleteGeneratedImage(jobId, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/user/generations/${jobId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error("Failed to delete generated image");

      loadGeneratedImages(token); // Reload list

    } catch (e) {
      alert("Error deleting image: " + e.message);
    }
  }


});